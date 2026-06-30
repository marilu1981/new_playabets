"""
compare_high_risk_lists.py
----------------------------
Compares the original Users_at_risk_of_churning_on_5June2026_HIGH.xlsx list
against the High tier of a freshly-rebuilt sociotopo_features parquet, to
determine whether they're the same cohort (just rescored) or genuinely
different populations.

Usage (on the VM):
    python -m src.tools.compare_high_risk_lists \
        --old-list docs/Users_at_risk_of_churning_on_5June2026_HIGH.xlsx \
        --features data/serving/sociotopo_features_5june.parquet
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.tools.check_atrisk_churn import _read_userids


def main() -> None:
    p = argparse.ArgumentParser(description="Compare two High-risk userid lists")
    p.add_argument("--old-list", required=True, help="Path to the original HIGH risk file")
    p.add_argument("--features", required=True, help="Path to the rebuilt sociotopo_features parquet")
    p.add_argument("--tier", default="High", help="Risk tier to filter the new features to (default High)")
    args = p.parse_args()

    old_ids = _read_userids(Path(args.old_list))
    print(f"[compare] old list ({args.old_list}): {len(old_ids):,} users")

    feat = pd.read_parquet(args.features)
    new_ids = set(feat.loc[feat["risk_tier"] == args.tier, "userid"].astype(int))
    print(f"[compare] new {args.tier} tier ({args.features}): {len(new_ids):,} users")

    overlap = old_ids & new_ids
    only_old = old_ids - new_ids
    only_new = new_ids - old_ids

    print(f"\n[compare] overlap ............ {len(overlap):,}  "
          f"({len(overlap)/len(old_ids)*100:.1f}% of old, {len(overlap)/len(new_ids)*100:.1f}% of new)")
    print(f"[compare] only in old list .... {len(only_old):,}")
    print(f"[compare] only in new {args.tier} ... {len(only_new):,}")

    # Where did the "only in old" users end up in the new scoring?
    if only_old:
        moved = feat[feat["userid"].isin(only_old)]
        print(f"\n[compare] of the {len(only_old):,} users only in the OLD list, "
              f"their NEW risk_tier breakdown:")
        if not moved.empty:
            print(moved["risk_tier"].value_counts().to_string())
        not_found = only_old - set(feat["userid"])
        if not_found:
            print(f"  not found in new features at all: {len(not_found):,}")


if __name__ == "__main__":
    main()
