"""
churned_segment_value.py
-------------------------
For a list of churned userids (one risk tier at a time), compute each player's
average monthly deposit value over the last 6 months, based on the number of
months they were actually active in that window (not a flat /6 average).

avg_monthly_value = sum(deposits, Jan-Jun 2026) / count(distinct months with any tx_count > 0)

Then sums that per-player average across the whole churned segment to give a
"typical monthly value lost" figure per tier, alongside the straight 6-month
deposit total for reference.

Usage (on the VM):
    python -m src.tools.churned_segment_value \
        --churn-result data/serving/high_churn_result.csv \
        --window-start 2026-01 --window-end 2026-06 \
        --out data/serving/high_churned_value.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.app_config import raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols, to_num


def _monthly_tx(window_start: str, window_end: str) -> pd.DataFrame:
    folder = raw_dir("user_transactions")
    df = read_all_parquets(folder, "user_transactions_*.parquet")
    if df.empty:
        print("[value] WARNING: no user_transactions data found.")
        return pd.DataFrame(columns=["userid", "month", "deposits"])
    df, col = normalize_cols(df)
    if "month" not in col or "deposits" not in col or "userid" not in col:
        print(f"[value] WARNING: expected columns not found. Got: {list(col)}")
        return pd.DataFrame(columns=["userid", "month", "deposits"])
    df["_month"] = df[col["month"]].astype(str)
    df = df[(df["_month"] >= window_start) & (df["_month"] <= window_end)]
    df["userid"] = to_num(df[col["userid"]], default=None)
    df = df.dropna(subset=["userid"])
    df["userid"] = df["userid"].astype(int)
    df["deposits"] = to_num(df[col["deposits"]], default=0.0)
    return df[["userid", "_month", "deposits"]].rename(columns={"_month": "month"})


def main() -> None:
    p = argparse.ArgumentParser(description="Average monthly deposit value for a churned segment")
    p.add_argument("--churn-result", required=True,
                   help="Path to a check_atrisk_churn.py --rule since output CSV (has userid, churned)")
    p.add_argument("--window-start", default="2026-01", help="First month YYYY-MM of the lookback window")
    p.add_argument("--window-end", default="2026-06", help="Last month YYYY-MM of the lookback window")
    p.add_argument("--out", default=None, help="Output CSV path (default: alongside --churn-result)")
    args = p.parse_args()

    churn_df = pd.read_csv(args.churn_result)
    if "churned" not in churn_df.columns or "userid" not in churn_df.columns:
        raise SystemExit(f"--churn-result must have userid + churned columns, got: {list(churn_df.columns)}")

    churned_ids = set(churn_df.loc[churn_df["churned"] == 1, "userid"].astype(int))
    print(f"[value] churned users in this tier: {len(churned_ids):,}")

    tx = _monthly_tx(args.window_start, args.window_end)
    tx = tx[tx["userid"].isin(churned_ids)]

    per_user = tx.groupby("userid").agg(
        total_deposits_6m=("deposits", "sum"),
        active_months_6m=("month", "nunique"),
    ).reset_index()
    per_user["avg_monthly_value"] = per_user["total_deposits_6m"] / per_user["active_months_6m"].clip(lower=1)

    # Churned users with no transaction history at all in the window get zero value
    no_tx_ids = churned_ids - set(per_user["userid"])
    if no_tx_ids:
        filler = pd.DataFrame({
            "userid": list(no_tx_ids),
            "total_deposits_6m": 0.0,
            "active_months_6m": 0,
            "avg_monthly_value": 0.0,
        })
        per_user = pd.concat([per_user, filler], ignore_index=True)

    out_path = Path(args.out) if args.out else Path(args.churn_result).with_name(
        Path(args.churn_result).stem + "_value.csv")
    per_user.to_csv(out_path, index=False)

    total_6m_deposits = per_user["total_deposits_6m"].sum()
    avg_monthly_per_player = per_user["avg_monthly_value"].mean()
    sum_avg_monthly = per_user["avg_monthly_value"].sum()

    print(f"\n=== CHURNED SEGMENT VALUE ({args.window_start} to {args.window_end}) ===")
    print(f"Churned players ................... {len(per_user):,}")
    print(f"Total deposits over window ........ R{total_6m_deposits:,.0f}")
    print(f"Avg monthly value per player ...... R{avg_monthly_per_player:,.0f}")
    print(f"Sum of avg monthly value (segment). R{sum_avg_monthly:,.0f}   <- 'typical monthly value lost'")
    print(f"\nSaved per-user detail -> {out_path}")


if __name__ == "__main__":
    main()
