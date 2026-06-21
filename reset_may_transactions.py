"""
reset_may_transactions.py
-------------------------
One-off cleanup: removes ALL May 2026 rows from transactions_agg_full.parquet
and deletes any leftover May daily-agg increment files, so a fresh backfill
starts from a clean slate.

Run from project root on the VM:
    python reset_may_transactions.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from pathlib import Path
from src.app_config import raw_dir

tx_dir = raw_dir("transactions")
full_path = tx_dir / "transactions_agg_full.parquet"

print(f"Transactions dir: {tx_dir}")

# 1. Strip May 2026 from the full file
if full_path.exists():
    df = pd.read_parquet(full_path)
    df["date"] = pd.to_datetime(df["date"]).dt.date
    import datetime as _dt
    may_start = _dt.date(2026, 5, 1)
    may_end = _dt.date(2026, 5, 31)
    before = len(df)
    may_rows = df[(df["date"] >= may_start) & (df["date"] <= may_end)]
    print(f"Full file: {before} rows total, {len(may_rows)} are May 2026")
    if len(may_rows) > 0:
        print(f"  May net (being removed): {may_rows['net_deposits'].sum():,.0f}")
    df = df[~((df["date"] >= may_start) & (df["date"] <= may_end))]
    df.to_parquet(full_path, index=False)
    print(f"Full file: removed {before - len(df)} May rows -> {len(df)} rows remain")
else:
    print("No full file found.")

# 2. Delete any leftover May daily-agg increment files
may_files = list(tx_dir.glob("transactions_daily_agg_2026-05-*.parquet"))
for f in may_files:
    f.unlink()
print(f"Deleted {len(may_files)} leftover May daily-agg files")

print("\nMay 2026 is now clean. Run the backfill next.")
