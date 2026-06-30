"""
check_nonhigh_churn.py
-----------------------
Companion to check_atrisk_churn.py — checks churn for the players NOT flagged
High or Critical risk on 5 June 2026 (i.e. the Moderate/Low population), using
the exact same methodology as the validated High-risk result:

    Baseline = players who placed a real-money bet in May 2026 (sports or casino),
               EXCLUDING anyone in the High or Critical at-risk lists.
    Churned  = no real-money bet after 5 June 2026 (through the data's latest date).

This mirrors src/tools/check_atrisk_churn.py --rule since --since 2026-06-05
--require-active-in 2026-05, just with the flagged population inverted.

Must run where raw parquets cover May through June/July 2026 (the VM).

Usage:
    python -m src.tools.check_nonhigh_churn \
        --high docs/Users_at_risk_of_churning_on_5June2026_HIGH.xlsx \
        --critical docs/Users_at_risk_of_churning_on_5June2026_CRITICAL.xlsx \
        --since 2026-06-05 \
        --require-active-in 2026-05 \
        --out data/serving/nonhigh_churn_result.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.tools.check_atrisk_churn import _read_userids, _last_activity_per_user


def main() -> None:
    p = argparse.ArgumentParser(description="Check churn for players NOT flagged High/Critical risk")
    p.add_argument("--high", required=True, help="Path to the HIGH risk userid file")
    p.add_argument("--critical", required=True, help="Path to the CRITICAL risk userid file")
    p.add_argument("--since", default="2026-06-05", help="Flag date; churned = no bet after this date")
    p.add_argument("--require-active-in", default="2026-05",
                   help="Comma months e.g. 2026-05 — restrict baseline to players active in these months")
    p.add_argument("--out", default="data/serving/nonhigh_churn_result.csv", help="Output CSV path")
    args = p.parse_args()

    high = _read_userids(Path(args.high))
    critical = _read_userids(Path(args.critical))
    excluded = high | critical
    print(f"[nonhigh] High risk: {len(high):,}   Critical risk: {len(critical):,}   "
          f"combined excluded: {len(excluded):,}")

    require_months = {m.strip() for m in args.require_active_in.split(",") if m.strip()}
    since = pd.Timestamp(args.since)

    # _last_activity_per_user needs a "flagged" set to restrict the per-user lookup to —
    # but here we want everyone EXCEPT high/critical, which is the full user population
    # minus a known set. We can't pre-enumerate "everyone" cheaply, so instead pull
    # activity for ALL users active in the required months, then exclude high/critical.
    from src.app_config import raw_dir
    from src.kpis.io_utils import read_all_parquets, normalize_cols

    def _active_users_in_months(months: set[str]) -> set[int]:
        users: set[int] = set()
        bs_raw = read_all_parquets(raw_dir("betslips"), "betslips*.parquet")
        if not bs_raw.empty:
            bs, m = normalize_cols(bs_raw)
            uid, dcol, credit = m.get("userid"), m.get("placementdate"), m.get("credittype")
            if uid and dcol:
                if credit:
                    bs = bs[bs[credit].astype(str) == "User Account"]
                bs["_dt"] = pd.to_datetime(bs[dcol], errors="coerce")
                bs["_month"] = bs["_dt"].dt.to_period("M").astype(str)
                bs = bs[bs["_month"].isin(months)].dropna(subset=["_dt"])
                users |= set(pd.to_numeric(bs[uid], errors="coerce").dropna().astype(int).tolist())
        ca_raw = read_all_parquets(raw_dir("casino"), "*.parquet")
        if not ca_raw.empty:
            ca, m = normalize_cols(ca_raw)
            uid, dcol, stake = m.get("userid"), m.get("placementdate"), m.get("stake")
            if uid and dcol:
                if stake:
                    ca = ca[pd.to_numeric(ca[stake], errors="coerce").fillna(0) > 0]
                ca["_dt"] = pd.to_datetime(ca[dcol], errors="coerce")
                ca["_month"] = ca["_dt"].dt.to_period("M").astype(str)
                ca = ca[ca["_month"].isin(months)].dropna(subset=["_dt"])
                users |= set(pd.to_numeric(ca[uid], errors="coerce").dropna().astype(int).tolist())
        return users

    may_active = _active_users_in_months(require_months)
    print(f"[nonhigh] real-money active in {sorted(require_months)}: {len(may_active):,}")

    baseline = may_active - excluded
    print(f"[nonhigh] baseline (May-active, NOT High/Critical): {len(baseline):,}")

    last, data_max, months = _last_activity_per_user(baseline)
    if data_max is None:
        print("[nonhigh] WARNING: no activity found in raw data at all.")
        return

    print(f"[nonhigh] data latest date = {data_max.date()}   flagged on = {since.date()}   "
          f"checking bets after {since.date()} (through {data_max.date()})")

    rows = []
    for uid in baseline:
        lb = last.get(uid)
        ever_active = lb is not None
        bet_after = ever_active and lb > since
        churned = ever_active and not bet_after
        rows.append({
            "userid": uid,
            "last_bet_date": lb.date().isoformat() if ever_active else "",
            "active_months": ";".join(sorted(months.get(uid, []))),
            "bet_after_flag": int(bet_after),
            "ever_active": int(ever_active),
            "churned": int(churned),
        })

    res = pd.DataFrame(rows)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    res.to_csv(out, index=False)

    n_base = len(res)
    n_ever = int(res["ever_active"].sum()) if n_base else 0
    n_churned = int(res["churned"].sum()) if n_base else 0
    n_retained = n_ever - n_churned

    print("\n" + "=" * 64)
    print(f"NOT HIGH/CRITICAL CHURN RESULT (baseline: active in {sorted(require_months)}; "
          f"churn = no bet after {since.date()})")
    print("=" * 64)
    print(f"Baseline players ........................... {n_base:,}")
    if n_ever:
        print(f"  -> Churned (no bet after {since.date()}) ..... {n_churned:,}   ({n_churned / n_ever * 100:.1f}%)")
        print(f"  -> Retained (bet after {since.date()}) ....... {n_retained:,}   ({n_retained / n_ever * 100:.1f}%)")
    print(f"\nSaved per-user result -> {out}")


if __name__ == "__main__":
    main()
