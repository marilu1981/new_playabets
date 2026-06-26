"""
churn_last_bet_breakdown.py
---------------------------
Post-process the per-user result CSV from check_atrisk_churn.py (--rule since)
and bucket the CHURNED players by WHEN they last bet.

Purpose: test whether the at-risk list re-flagged already-dormant accounts
(last bet long before the flag date) or caught players who were genuinely
active recently (e.g. bet in May 2026) and then went quiet.

Usage:
    python -m src.tools.churn_last_bet_breakdown \
        --result data/serving/atrisk_churn_since_5June_result.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def main() -> None:
    p = argparse.ArgumentParser(description="Bucket churned at-risk players by last-bet month")
    p.add_argument("--result", required=True, help="Per-user CSV from check_atrisk_churn (--rule since)")
    p.add_argument("--out", default=None, help="Optional CSV: churned players who last bet in May 2026")
    args = p.parse_args()

    df = pd.read_csv(args.result)
    if "churned" not in df.columns or "last_bet_date" not in df.columns:
        raise SystemExit(f"[breakdown] expected columns churned + last_bet_date in {args.result}")

    churned = df[df["churned"] == 1].copy()
    churned["last_bet_date"] = pd.to_datetime(churned["last_bet_date"], errors="coerce")
    churned = churned.dropna(subset=["last_bet_date"])

    n_churned_total = int((df["churned"] == 1).sum())
    n_with_date = len(churned)

    churned["last_bet_month"] = churned["last_bet_date"].dt.to_period("M").astype(str)

    # Key buckets
    may = churned[churned["last_bet_month"] == "2026-05"]
    jun_pre_flag = churned[(churned["last_bet_date"] >= "2026-06-01") &
                           (churned["last_bet_date"] <= "2026-06-05")]
    before_may = churned[churned["last_bet_date"] < "2026-05-01"]

    print("=" * 60)
    print("CHURNED at-risk players — when did they last bet?")
    print("=" * 60)
    print(f"Churned (no bet after 5 June) .............. {n_churned_total:,}")
    print(f"  with a recorded last-bet date ........... {n_with_date:,}")
    print()
    print(f"  Last bet in MAY 2026 .................... {len(may):,}"
          f"   ({len(may) / n_with_date * 100:.1f}% of churned-with-date)")
    print(f"  Last bet 1-5 JUNE 2026 (just before flag)  {len(jun_pre_flag):,}"
          f"   ({len(jun_pre_flag) / n_with_date * 100:.1f}%)")
    print(f"  Last bet BEFORE May 2026 (long dormant) .. {len(before_may):,}"
          f"   ({len(before_may) / n_with_date * 100:.1f}%)")
    print()
    print("Full month-by-month last-bet distribution (churned):")
    dist = churned["last_bet_month"].value_counts().sort_index()
    for month, cnt in dist.items():
        print(f"  {month} ..... {cnt:,}")

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        may.sort_values("last_bet_date").to_csv(out, index=False)
        print(f"\nSaved churned-who-bet-in-May -> {out}")


if __name__ == "__main__":
    main()
