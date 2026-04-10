"""
merge_transactions.py
---------------------
Merges all local transaction backfill parquet files into a single
transactions_daily.parquet serving file, ready to SCP to the VM.

Run from the project root:
    python scripts/merge_transactions.py
"""
from __future__ import annotations

import pandas as pd
from pathlib import Path

RAW_DIR     = Path("data/raw/transactions")
OUT_FILE    = Path("data/serving/transactions_daily.parquet")

def main() -> None:
    agg_files = sorted(RAW_DIR.glob("transactions_daily_agg_*.parquet"))
    if not agg_files:
        print(f"No files found in {RAW_DIR}")
        return

    print(f"Found {len(agg_files)} files — merging...")
    df = pd.concat((pd.read_parquet(f) for f in agg_files), ignore_index=True)
    df = df.sort_values("date").drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_FILE, index=False)
    print(f"Saved {len(df)} rows → {OUT_FILE}")
    print(f"Date range: {df['date'].min()} → {df['date'].max()}")
    print(f"Total deposits:    {df['deposits'].sum():,.0f}")
    print(f"Total withdrawals: {df['withdrawals'].sum():,.0f}")

if __name__ == "__main__":
    main()
