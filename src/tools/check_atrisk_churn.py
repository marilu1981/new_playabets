"""
check_atrisk_churn.py
---------------------
Check whether the players flagged "at risk of churning on 5 June 2026" actually
churned, using the SAME churn definition as the dashboard KPI:

    Churned = was active (sports OR casino) in the FLAG month, but placed
              NO real-money bet at all in the FOLLOWING month.

    Activity = union of sports betslips (CreditType == "User Account")
               + casino bets (Stake > 0), by placement date.
    (This mirrors src/kpis/build_domain_kpis.py churn computation exactly.)

The at-risk list was generated on 5 June 2026, so the flag month is 2026-06 and
churn resolves in 2026-07. A flagged player counts as churned if they were active
in June 2026 and had zero activity in July 2026.

This script must run where the raw parquets cover June + July 2026 (the Azure VM /
file share). Local dev data ends March 2026 and will NOT work.

Usage:
    python -m src.tools.check_atrisk_churn \
        --atrisk docs/Users_at_risk_of_churning_on_5June2026_CRITICAL.xlsx \
        --flag-month 2026-06 \
        --out data/serving/atrisk_churn_result.csv

Outputs:
    - Console summary: total flagged, active-in-flag-month, churned, retained, %.
    - CSV per user: userid, was_active_flag_month, active_next_month, churned.
"""
from __future__ import annotations

import argparse
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd

from src.app_config import raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols


_XL_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _read_userids_xlsx(path: Path) -> set[int]:
    """Read a single-column 'userid' .xlsx using stdlib only (no openpyxl)."""
    z = zipfile.ZipFile(path)
    shared: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall(f"{_XL_NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{_XL_NS}t")))
    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    def cellval(c) -> str:
        v = c.find(f"{_XL_NS}v")
        if v is None:
            return ""
        if c.get("t") == "s":
            return shared[int(v.text)]
        return v.text or ""

    ids: set[int] = set()
    for r in sheet.findall(f".//{_XL_NS}row"):
        cells = r.findall(f"{_XL_NS}c")
        if not cells:
            continue
        raw = cellval(cells[0]).strip()
        if raw.lower() == "userid" or not raw:
            continue
        try:
            ids.add(int(float(raw)))
        except ValueError:
            continue
    return ids


def _read_userids(path: Path) -> set[int]:
    if path.suffix.lower() in (".xlsx", ".xlsm"):
        return _read_userids_xlsx(path)
    # CSV fallback
    df = pd.read_csv(path)
    col = "userid" if "userid" in df.columns else df.columns[0]
    return set(pd.to_numeric(df[col], errors="coerce").dropna().astype(int).tolist())


def _last_activity_per_user(flagged: set[int]) -> tuple[dict[int, pd.Timestamp], pd.Timestamp | None]:
    """
    Return {userid: last_real_money_bet_date} for the flagged users only, across
    sports + casino, and the max activity date seen in the data (the data's
    'as of' date). Restricting to flagged users keeps memory sane for big lists.
    """
    last: dict[int, pd.Timestamp] = {}
    data_max: pd.Timestamp | None = None

    def _ingest(df, uid, dcol):
        nonlocal data_max
        d = pd.to_datetime(df[dcol], errors="coerce")
        u = pd.to_numeric(df[uid], errors="coerce")
        sub = pd.DataFrame({"u": u, "d": d}).dropna()
        if sub.empty:
            return
        sub["u"] = sub["u"].astype(int)
        m = sub["d"].max()
        data_max = m if data_max is None or m > data_max else data_max
        sub = sub[sub["u"].isin(flagged)]
        if sub.empty:
            return
        grp = sub.groupby("u")["d"].max()
        for uu, dd in grp.items():
            if uu not in last or dd > last[uu]:
                last[uu] = dd

    bs_raw = read_all_parquets(raw_dir("betslips"), "betslips*.parquet")
    if not bs_raw.empty:
        bs, m = normalize_cols(bs_raw)
        uid, dcol, credit = m.get("userid"), m.get("placementdate"), m.get("credittype")
        if uid and dcol:
            if credit:  # real money only, matches dashboard
                bs = bs[bs[credit].astype(str) == "User Account"]
            _ingest(bs, uid, dcol)

    ca_raw = read_all_parquets(raw_dir("casino"), "*.parquet")
    if not ca_raw.empty:
        ca, m = normalize_cols(ca_raw)
        uid, dcol, stake = m.get("userid"), m.get("placementdate"), m.get("stake")
        if uid and dcol:
            if stake:  # real money only, matches dashboard
                ca = ca[pd.to_numeric(ca[stake], errors="coerce").fillna(0) > 0]
            _ingest(ca, uid, dcol)

    return last, data_max


def _active_users_by_month(flag_month: str, next_month: str) -> tuple[dict[str, set[int]], dict[str, set[int]]]:
    """Return {month: set(userid)} for sports and casino, restricted to the two months."""
    wanted = {flag_month, next_month}

    sports: dict[str, set[int]] = {}
    bs_raw = read_all_parquets(raw_dir("betslips"), "betslips*.parquet")
    if not bs_raw.empty:
        bs, m = normalize_cols(bs_raw)
        uid, dcol, credit = m.get("userid"), m.get("placementdate"), m.get("credittype")
        if uid and dcol:
            if credit:  # real money only, matches dashboard
                bs = bs[bs[credit].astype(str) == "User Account"]
            bs["_dt"] = pd.to_datetime(bs[dcol], errors="coerce")
            bs["_month"] = bs["_dt"].dt.to_period("M").astype(str)
            bs = bs[bs["_month"].isin(wanted)].dropna(subset=["_dt"])
            for month, grp in bs.groupby("_month"):
                sports[month] = set(grp[uid].dropna().astype(int).tolist())

    casino: dict[str, set[int]] = {}
    ca_raw = read_all_parquets(raw_dir("casino"), "*.parquet")
    if not ca_raw.empty:
        ca, m = normalize_cols(ca_raw)
        uid, dcol, stake = m.get("userid"), m.get("placementdate"), m.get("stake")
        if uid and dcol:
            if stake:  # real money only, matches dashboard
                ca = ca[pd.to_numeric(ca[stake], errors="coerce").fillna(0) > 0]
            ca["_dt"] = pd.to_datetime(ca[dcol], errors="coerce")
            ca["_month"] = ca["_dt"].dt.to_period("M").astype(str)
            ca = ca[ca["_month"].isin(wanted)].dropna(subset=["_dt"])
            for month, grp in ca.groupby("_month"):
                casino[month] = set(grp[uid].dropna().astype(int).tolist())

    return sports, casino


def _run_silence(flagged: set[int], silence_days: int, as_of_arg: str | None, out: Path) -> None:
    """
    Silence rule (matches the at-risk model): churned = last real-money bet was
    silence_days+ ago as of the data's latest date (or --as-of). Works mid-month;
    does not need the calendar month to be complete.
    """
    last, data_max = _last_activity_per_user(flagged)
    if data_max is None:
        print("[atrisk] WARNING: no activity found in raw data at all. Is the data present on this machine?")
        return
    as_of = pd.Timestamp(as_of_arg) if as_of_arg else data_max
    cutoff = as_of - pd.Timedelta(days=silence_days)
    print(f"[atrisk] data latest date = {data_max.date()}   as_of = {as_of.date()}   "
          f"silence cutoff = {cutoff.date()} ({silence_days}d)")

    rows = []
    for uid in flagged:
        lb = last.get(uid)
        ever_active = lb is not None
        days_since = int((as_of - lb).days) if ever_active else None
        # Churned = had activity at some point but last bet is older than cutoff.
        churned = ever_active and lb < cutoff
        rows.append({
            "userid": uid,
            "last_bet_date": lb.date().isoformat() if ever_active else "",
            "days_since_last_bet": days_since if days_since is not None else "",
            "ever_active": int(ever_active),
            "churned": int(churned),
        })

    res = pd.DataFrame(rows)
    out.parent.mkdir(parents=True, exist_ok=True)
    res.to_csv(out, index=False)

    n_flagged = len(res)
    n_ever = int(res["ever_active"].sum())
    n_churned = int(res["churned"].sum())
    n_retained = n_ever - n_churned
    n_never = n_flagged - n_ever

    print("\n" + "=" * 64)
    print(f"AT-RISK CHURN RESULT (silence rule: {silence_days}+ days no bet)")
    print("=" * 64)
    print(f"Flagged at-risk ............................ {n_flagged:,}")
    print(f"  Ever active in the data ................. {n_ever:,}")
    if n_ever:
        print(f"    -> Churned (silent {silence_days}+ days) ....... {n_churned:,}   ({n_churned / n_ever * 100:.1f}% of active)")
        print(f"    -> Retained (bet within {silence_days} days) ... {n_retained:,}   ({n_retained / n_ever * 100:.1f}% of active)")
    print(f"  Never seen in betting data ............. {n_never:,}")
    print(f"\nSaved per-user result -> {out}")


def _run_since(flagged: set[int], since_arg: str, out: Path) -> None:
    """
    Since rule: churned = a flagged player who was ever active, but placed NO
    real-money bet AFTER the `since` date (i.e. went quiet after being flagged).
    'After' is strictly > since (the flag day itself does not count as retention).
    """
    since = pd.Timestamp(since_arg)
    last, data_max = _last_activity_per_user(flagged)
    if data_max is None:
        print("[atrisk] WARNING: no activity found in raw data at all.")
        return
    print(f"[atrisk] data latest date = {data_max.date()}   flagged on = {since.date()}   "
          f"checking bets after {since.date()} (through {data_max.date()})")

    rows = []
    for uid in flagged:
        lb = last.get(uid)
        ever_active = lb is not None
        bet_after = ever_active and lb > since
        churned = ever_active and not bet_after  # active before, silent since flag
        rows.append({
            "userid": uid,
            "last_bet_date": lb.date().isoformat() if ever_active else "",
            "bet_after_flag": int(bet_after),
            "ever_active": int(ever_active),
            "churned": int(churned),
        })

    res = pd.DataFrame(rows)
    out.parent.mkdir(parents=True, exist_ok=True)
    res.to_csv(out, index=False)

    n_flagged = len(res)
    n_ever = int(res["ever_active"].sum())
    n_churned = int(res["churned"].sum())
    n_retained = n_ever - n_churned
    n_never = n_flagged - n_ever

    print("\n" + "=" * 64)
    print(f"AT-RISK CHURN RESULT (no bet since {since.date()})")
    print("=" * 64)
    print(f"Flagged at-risk ............................ {n_flagged:,}")
    print(f"  Ever active in the data ................. {n_ever:,}")
    if n_ever:
        print(f"    -> Churned (no bet after {since.date()}) ... {n_churned:,}   ({n_churned / n_ever * 100:.1f}% of active)")
        print(f"    -> Retained (bet after {since.date()}) ..... {n_retained:,}   ({n_retained / n_ever * 100:.1f}% of active)")
    print(f"  Never seen in betting data ............. {n_never:,}")
    print(f"\nSaved per-user result -> {out}")


def main() -> None:
    p = argparse.ArgumentParser(description="Check at-risk players against churn definitions")
    p.add_argument("--atrisk", required=True, help="Path to the at-risk userid file (.xlsx or .csv)")
    p.add_argument("--rule", choices=["silence", "since", "month"], default="silence",
                   help="silence = N-day no-bet rule (matches model); "
                        "since = no bet after --since date (went quiet after flagging); "
                        "month = dashboard calendar-month rule")
    p.add_argument("--since", default=None, help="(since rule) flag date YYYY-MM-DD; churned = no bet after this date")
    p.add_argument("--silence-days", type=int, default=21, help="Days of no bet = churned (silence rule), default 21")
    p.add_argument("--as-of", default=None, help="Override 'as of' date (YYYY-MM-DD); default = latest date in data")
    p.add_argument("--flag-month", default="2026-05", help="(month rule) Month list was generated (YYYY-MM)")
    p.add_argument("--out", default="data/serving/atrisk_churn_result.csv", help="Output CSV path")
    args = p.parse_args()

    atrisk_path = Path(args.atrisk)
    flagged = _read_userids(atrisk_path)
    print(f"[atrisk] flagged users in list: {len(flagged):,}")

    out = Path(args.out)

    if args.rule == "silence":
        _run_silence(flagged, args.silence_days, args.as_of, out)
        return

    if args.rule == "since":
        if not args.since:
            p.error("--rule since requires --since YYYY-MM-DD")
        _run_since(flagged, args.since, out)
        return

    # ---- month rule (dashboard definition) ----
    flag_month = args.flag_month
    y, mn = map(int, flag_month.split("-"))
    next_month = f"{y + (mn == 12):04d}-{(mn % 12) + 1:02d}"
    print(f"[atrisk] flag month={flag_month}  resolves in next month={next_month}")

    sports, casino = _active_users_by_month(flag_month, next_month)

    active_flag = sports.get(flag_month, set()) | casino.get(flag_month, set())
    active_next = sports.get(next_month, set()) | casino.get(next_month, set())
    print(f"[atrisk] all active users in {flag_month}: {len(active_flag):,}")
    print(f"[atrisk] all active users in {next_month}: {len(active_next):,}")

    if not active_next and not active_flag:
        print("\n[atrisk] WARNING: no activity found for either month. "
              "Is the raw data on this machine current through "
              f"{next_month}? (Local dev data ends 2026-03.)")

    rows = []
    for uid in flagged:
        was_active = uid in active_flag
        active_after = uid in active_next
        # Dashboard definition: churned only counts those active in flag month
        # who then went silent the next month.
        churned = was_active and not active_after
        rows.append({
            "userid": uid,
            "was_active_flag_month": int(was_active),
            "active_next_month": int(active_after),
            "churned": int(churned),
        })

    res = pd.DataFrame(rows)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    res.to_csv(out, index=False)

    n_flagged = len(res)
    n_active_flag = int(res["was_active_flag_month"].sum())
    n_retained = int(((res["was_active_flag_month"] == 1) & (res["active_next_month"] == 1)).sum())
    n_churned = int(res["churned"].sum())
    n_inactive_flag = n_flagged - n_active_flag

    print("\n" + "=" * 60)
    print("AT-RISK CHURN RESULT (dashboard churn definition)")
    print("=" * 60)
    print(f"Flagged at-risk on 5 June 2026 .......... {n_flagged:,}")
    print(f"  Active in {flag_month} (flag month) ....... {n_active_flag:,}")
    print(f"    -> Churned (silent in {next_month}) ..... {n_churned:,}"
          f"   ({n_churned / n_active_flag * 100:.1f}% of active)" if n_active_flag else "")
    print(f"    -> Retained (bet in {next_month}) ....... {n_retained:,}"
          f"   ({n_retained / n_active_flag * 100:.1f}% of active)" if n_active_flag else "")
    print(f"  Not active in flag month (n/a) ........ {n_inactive_flag:,}")
    print(f"\nSaved per-user result -> {out}")


if __name__ == "__main__":
    main()
