"""
bonus_vs_nonbonus.py
--------------------
Compare the VALUE of bonused players vs non-bonused players, like-for-like.

Cohorts (both are REAL-MONEY ACTIVE players in the window):
    BONUS     = active players who received >=1 Credited bonus in the window
    NON-BONUS = active players who received NO credited bonus in the window

"Active" = placed a real-money bet (sports CreditType=="User Account" or casino Stake>0).
This is the cleanest like-for-like control: both groups actually bet; the only
difference is whether they got a bonus.

Per-player value metrics, per cohort:
    avg turnover, avg GGR, avg bets, avg active days, net value per player
    (net value = GGR - bonus issued; non-bonus cohort has bonus cost 0).

WHY THIS ANSWERS "against what is 12x good?":
    A campaign metric like turnover-per-bonus-rand means nothing alone. The
    benchmark is your OWN non-bonus players. If a bonused player's NET value
    exceeds a comparable non-bonused player's, the bonus added value. If not,
    the programme is subsidising play that would (mostly) have happened anyway.
    Breakeven for net value is 0: did bonus-driven GGR cover the bonus cost.

Usage (on the VM):
    python -m src.tools.bonus_vs_nonbonus --start 2026-01-01 --out data/serving/bonus_vs_nonbonus.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from src.app_config import raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols, to_dt, to_num

ISSUED_STATUS = "Credited"


def _credited_bonus_by_user(start, end) -> pd.DataFrame:
    raw = read_all_parquets(raw_dir("bonus"), "bonuses_increment*.parquet")
    if raw.empty:
        return pd.DataFrame(columns=["userid", "bonus_issued", "bonus_count"])
    df, m = normalize_cols(raw)
    uid, amt, status, dcol, bid = (m.get("userid"), m.get("amount"), m.get("bonusstatus"),
                                   m.get("insertdate"), m.get("bonusid"))
    df = df.rename(columns={uid: "userid", amt: "amount", status: "bonus_status", dcol: "insert_date"})
    df["userid"] = to_num(df["userid"], default=np.nan)
    df["amount"] = to_num(df["amount"], default=0.0)
    df["insert_date"] = to_dt(df["insert_date"])
    df = df.dropna(subset=["userid", "insert_date"])
    df["userid"] = df["userid"].astype(int)
    df = df[(df["insert_date"] >= start) & (df["insert_date"] <= end)]
    if bid and bid in df.columns:
        df = df.drop_duplicates(subset=[bid], keep="last")
    df = df[df["bonus_status"] == ISSUED_STATUS]
    return df.groupby("userid").agg(bonus_issued=("amount", "sum"),
                                    bonus_count=("amount", "size")).reset_index()


def _realmoney_activity(start, end) -> pd.DataFrame:
    """Per-user real-money turnover, winnings, bets, active days (sports User Account + casino Stake>0)."""
    rows = []
    bs = read_all_parquets(raw_dir("betslips"), "betslips*.parquet")
    if not bs.empty:
        d, m = normalize_cols(bs)
        uid, dcol, stake, win, credit = (m.get("userid"), m.get("placementdate"),
                                         m.get("stake"), m.get("winnings"), m.get("credittype"))
        if credit:
            d = d[d[credit].astype(str) == "User Account"]
        d["userid"] = to_num(d[uid], default=np.nan)
        d["_dt"] = to_dt(d[dcol])
        d["stake"] = to_num(d[stake], default=0.0)
        d["win"] = to_num(d[win], default=0.0)
        d = d.dropna(subset=["userid", "_dt"])
        d = d[(d["_dt"] >= start) & (d["_dt"] <= end)]
        d["userid"] = d["userid"].astype(int)
        rows.append(d[["userid", "_dt", "stake", "win"]])
    ca = read_all_parquets(raw_dir("casino"), "*.parquet")
    if not ca.empty:
        d, m = normalize_cols(ca)
        uid, dcol, stake, win = m.get("userid"), m.get("placementdate"), m.get("stake"), m.get("winnings")
        d["userid"] = to_num(d[uid], default=np.nan)
        d["_dt"] = to_dt(d[dcol])
        d["stake"] = to_num(d[stake], default=0.0)
        d["win"] = to_num(d[win], default=0.0)
        d = d[d["stake"] > 0]
        d = d.dropna(subset=["userid", "_dt"])
        d = d[(d["_dt"] >= start) & (d["_dt"] <= end)]
        d["userid"] = d["userid"].astype(int)
        rows.append(d[["userid", "_dt", "stake", "win"]])
    if not rows:
        return pd.DataFrame(columns=["userid", "turnover", "winnings", "bets", "active_days", "ggr"])
    allbets = pd.concat(rows, ignore_index=True)
    allbets["_day"] = allbets["_dt"].dt.date
    g = allbets.groupby("userid").agg(
        turnover=("stake", "sum"), winnings=("win", "sum"),
        bets=("stake", "size"), active_days=("_day", "nunique")).reset_index()
    g["ggr"] = g["turnover"] - g["winnings"]
    return g


def _cohort_stats(df: pd.DataFrame, label: str) -> dict:
    n = len(df)
    if n == 0:
        return {"cohort": label, "players": 0}
    return {
        "cohort": label,
        "players": n,
        "avg_turnover": round(df["turnover"].mean(), 2),
        "median_turnover": round(df["turnover"].median(), 2),
        "avg_ggr": round(df["ggr"].mean(), 2),
        "avg_bets": round(df["bets"].mean(), 1),
        "avg_active_days": round(df["active_days"].mean(), 1),
        "avg_bonus_cost": round(df.get("bonus_issued", pd.Series(0)).mean(), 2),
        "avg_net_value": round((df["ggr"] - df.get("bonus_issued", 0)).mean(), 2),
        "total_ggr": round(df["ggr"].sum(), 2),
        "total_bonus_cost": round(df.get("bonus_issued", pd.Series(0)).sum(), 2),
        "total_net_value": round((df["ggr"] - df.get("bonus_issued", 0)).sum(), 2),
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Bonus vs non-bonus player value comparison")
    p.add_argument("--start", default="2026-01-01")
    p.add_argument("--end", default=None)
    p.add_argument("--out", default="data/serving/bonus_vs_nonbonus.csv")
    args = p.parse_args()

    start = pd.Timestamp(args.start)
    end = pd.Timestamp(args.end) if args.end else pd.Timestamp.now().normalize() + pd.Timedelta(days=1)
    print(f"[cohort] window {start.date()} -> {end.date()}")

    activity = _realmoney_activity(start, end)
    bonus = _credited_bonus_by_user(start, end)
    bonus_ids = set(bonus["userid"])
    print(f"[cohort] real-money active players: {len(activity):,}")
    print(f"[cohort] credited-bonus players (any): {len(bonus_ids):,}")

    activity = activity.merge(bonus, on="userid", how="left")
    activity["bonus_issued"] = activity["bonus_issued"].fillna(0.0)
    activity["bonus_count"] = activity["bonus_count"].fillna(0).astype(int)

    bonus_cohort = activity[activity["userid"].isin(bonus_ids)]
    nonbonus_cohort = activity[~activity["userid"].isin(bonus_ids)]

    stats = pd.DataFrame([
        _cohort_stats(bonus_cohort, "BONUS (active, got credited bonus)"),
        _cohort_stats(nonbonus_cohort, "NON-BONUS (active, no bonus)"),
    ])
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    stats.to_csv(out, index=False)

    # uplift ratios (bonus vs non-bonus) for the headline answer
    def ratio(metric):
        b = stats.loc[0, metric]; nb = stats.loc[1, metric]
        return round(b / nb, 2) if nb else float("nan")

    print("\n=== BONUS vs NON-BONUS (per-player) ===")
    for _, r in stats.iterrows():
        print(f"\n{r['cohort']}  (n={r['players']:,})")
        if r["players"]:
            print(f"  avg turnover    R{r['avg_turnover']:,.0f}")
            print(f"  avg GGR         R{r['avg_ggr']:,.0f}")
            print(f"  avg bets        {r['avg_bets']:,.1f}   avg active days {r['avg_active_days']:,.1f}")
            print(f"  avg bonus cost  R{r['avg_bonus_cost']:,.0f}")
            print(f"  avg NET value   R{r['avg_net_value']:,.0f}")
    if stats.loc[1, "players"]:
        print("\n--- UPLIFT (bonus / non-bonus) ---")
        for mt in ["avg_turnover", "avg_ggr", "avg_bets", "avg_net_value"]:
            print(f"  {mt}: {ratio(mt)}x")
        print("\nINTERPRETATION: net value uplift > 1.0 (and bonus net value > 0) = bonus adds value.")
        print(f"  Bonus cohort total net value: R{stats.loc[0,'total_net_value']:,.0f}")
        print(f"  (positive = bonus-driven GGR covered bonus cost; negative = subsidising)")
    print(f"\n[cohort] saved -> {out}")


if __name__ == "__main__":
    main()
