"""
incremental_balances.py
------------------------
Pulls current balances snapshot from Dwh_en.view_balances (full-refresh).

Run from the project root:
    python -m src.extract.incremental_balances
"""
from __future__ import annotations

from datetime import datetime, UTC
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from src.extract.db_utils import build_engine

VIEW_NAME = "Dwh_en.view_balances"
COLUMNS = ["UserID", "Balance", "Credit", "LastTransactionDate"]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = PROJECT_ROOT / "data" / "raw" / "balances"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    cols_sql = ", ".join(COLUMNS)
    query = text(f"SELECT {cols_sql} FROM {VIEW_NAME}")

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    print(f"[balances] Rows pulled: {len(df)}")
    if df.empty:
        print("[balances] No data returned.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    snapshot = OUT_DIR / f"balances_snapshot_{ts}.parquet"
    latest = OUT_DIR / "balances_latest.parquet"
    df.to_parquet(snapshot, index=False)
    df.to_parquet(latest, index=False)
    print(f"[balances] Saved snapshot to {snapshot}")
    print(f"[balances] Updated latest to {latest}")


if __name__ == "__main__":
    main()
