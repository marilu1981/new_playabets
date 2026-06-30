"""
export_risk_tier_may_depositors.py
-----------------------------------
Filters a sociotopo_features parquet (e.g. the 5-June rerun) down to players who
made a deposit in May 2026, split by risk tier, for churn validation comparison
against the High-risk result.

"Deposited in May" = userid appears in raw/user_transactions with month=2026-05
and deposits > 0 (monthly aggregated format from Stats.Transazioni extract).

Usage (on the VM):
    python -m src.tools.export_risk_tier_may_depositors \
        --features data/serving/sociotopo_features_5june.parquet \
        --month 2026-05 \
        --outdir data/serving/risk_tier_may_depositors
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.app_config import raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols, to_num


def _may_depositor_ids(month: str) -> set[int]:
    folder = raw_dir("user_transactions")
    df = read_all_parquets(folder, "user_transactions_*.parquet")
    if df.empty:
        print("[depositors] WARNING: no user_transactions data found.")
        return set()
    df, col = normalize_cols(df)
    if "month" not in col or "deposits" not in col or "userid" not in col:
        print(f"[depositors] WARNING: expected columns not found. Got: {list(col)}")
        return set()
    df["_month"] = df[col["month"]].astype(str)
    df = df[df["_month"] == month]
    df["deposits"] = to_num(df[col["deposits"]], default=0.0)
    df = df[df["deposits"] > 0]
    df["userid"] = to_num(df[col["userid"]], default=None).dropna().astype(int)
    return set(df["userid"].tolist())


def main() -> None:
    p = argparse.ArgumentParser(description="Export May depositors by risk tier")
    p.add_argument("--features", required=True, help="Path to sociotopo_features parquet")
    p.add_argument("--month", default="2026-05", help="Deposit month YYYY-MM")
    p.add_argument("--outdir", default="data/serving/risk_tier_may_depositors", help="Output directory")
    args = p.parse_args()

    depositor_ids = _may_depositor_ids(args.month)
    print(f"[depositors] users who deposited in {args.month}: {len(depositor_ids):,}")

    feat = pd.read_parquet(args.features)
    feat = feat[feat["userid"].isin(depositor_ids)].copy()
    print(f"[depositors] matched in risk features: {len(feat):,}")

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    print("\n[depositors] risk tier breakdown (May depositors only):")
    tier_counts = feat["risk_tier"].value_counts()
    print(tier_counts.to_string())

    for tier in ["Critical", "High", "Moderate", "Low"]:
        sub = feat[feat["risk_tier"] == tier]
        out_path = outdir / f"{tier.lower()}_may_depositors.csv"
        sub[["userid", "risk_tier", "risk_score"]].to_csv(out_path, index=False)
        print(f"  {tier}: {len(sub):,} -> {out_path}")

    summary_path = outdir / "summary.csv"
    tier_counts.rename_axis("risk_tier").reset_index(name="count").to_csv(summary_path, index=False)
    print(f"\n[depositors] summary -> {summary_path}")


if __name__ == "__main__":
    main()
