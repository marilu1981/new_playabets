"""Utility to recompute RFM segments from preprocessing output using percentile buckets.

This mirrors the segmentation rules used by ``src.kpis.rfm_kpis`` but exposes
a quick CLI so you can rerun the quantile scoring and review how many users
land in each bucket without needing to rebuild the entire extract stack.

Usage:
    python scripts/rfm_segment_builder.py --input data/serving/rfm_users.parquet

Options:
    --output PATH   Write the augmented table (with fresh ``r_score``, ``f_score``,
                    ``m_score``, ``segment``) to a parquet file for spot checking.
"""

from __future__ import annotations

from argparse import ArgumentParser
from pathlib import Path
from typing import Optional

import pandas as pd


def _score_quantiles(series: pd.Series, ascending: bool) -> pd.Series:
    if series.nunique(dropna=True) <= 1:
        return pd.Series(3, index=series.index)

    ranks = series.rank(method="first", ascending=ascending)
    try:
        return pd.qcut(ranks, 5, labels=[1, 2, 3, 4, 5]).astype(int)
    except ValueError:
        return pd.cut(ranks, bins=5, labels=[1, 2, 3, 4, 5], include_lowest=True).astype(int)


def _assign_segment(row: pd.Series) -> str:
    r = int(row.get("r_score", 0))
    f = int(row.get("f_score", 0))
    m = int(row.get("m_score", 0))
    if r == 5 and f == 5 and m == 5:
        return "Champions"
    if f >= 4 and m == 5:
        return "Big Spenders"
    if r >= 4 and f >= 4 and m >= 3:
        return "Loyal"
    if r <= 2 and f >= 3:
        return "At Risk"
    if r <= 2 and f <= 2:
        return "Dormant"
    return "Mid"


def build_segments(df: pd.DataFrame) -> pd.DataFrame:
    for column in ["recency_days", "frequency_30d", "monetary_30d"]:
        if column not in df.columns:
            raise KeyError(f"missing {column} column in rfm input")

    scored = df.copy()
    scored["r_score"] = _score_quantiles(scored["recency_days"], ascending=True)
    scored["f_score"] = _score_quantiles(scored["frequency_30d"], ascending=False)
    scored["m_score"] = _score_quantiles(scored["monetary_30d"], ascending=False)
    scored["segment"] = scored.apply(_assign_segment, axis=1)
    return scored


def print_summary(df: pd.DataFrame) -> None:
    total = len(df)
    counts = df["segment"].value_counts().sort_values(ascending=False)
    print(f"Total users analyzed: {total}")
    for segment, cnt in counts.items():
        pct = cnt / total * 100 if total else 0
        print(f"  {segment:12}: {cnt:6d} users ({pct:5.1f}%)")


def main() -> None:
    parser = ArgumentParser(description="Rebuild RFM segments from percentile buckets")
    parser.add_argument("--input", type=Path, default=Path("data/serving/rfm_users.parquet"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Input file {args.input} does not exist")

    df = pd.read_parquet(args.input)
    segmented = build_segments(df)
    print_summary(segmented)

    if args.output:
        segmented.to_parquet(args.output, index=False)
        print(f"Wrote augmented table to {args.output}")


if __name__ == "__main__":
    main()
