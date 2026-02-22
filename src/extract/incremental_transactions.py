"""
incremental_transactions.py
----------------------------
Pulls new/updated rows from Dwh_en.view_Transactions incrementally via DateVersion.

Run from the project root:
    python -m src.extract.incremental_transactions

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from sqlalchemy import text

from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME     = "Dwh_en.view_payments"
CURSOR_COLUMN = "DateVersion"

COLUMNS = [
    "TransactionID", "UserID", "TransactionAmountTypeID", "TransactionAmountType",
    "TransactionStatusID", "TransactionStatus", "Amount", "CurrencyID",
    "CurrencyExchangeID", "Description", "DateVersion", "DetailDateVersion",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "transactions"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = get_watermark(WATERMARK_DB, VIEW_NAME)
    print(f"[transactions] Current watermark: {last_value}")

    cols_sql = ", ".join(COLUMNS)
    query = text(f"""
        SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql}
        FROM {VIEW_NAME}
        WHERE {CURSOR_COLUMN} > :last_value
    """)

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"last_value": last_value})

    print(f"[transactions] Rows pulled: {len(df)}")
    if df.empty:
        print("[transactions] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"transactions_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[transactions] Saved to {out_file}")

    set_watermark(WATERMARK_DB, VIEW_NAME, str(df["__cursor__"].max()))
    print(f"[transactions] Updated watermark to: {df['__cursor__'].max()}")


if __name__ == "__main__":
    main()
