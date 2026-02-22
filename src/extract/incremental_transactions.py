"""
incremental_transactions.py
----------------------------
Pulls new/updated rows from Dwh_en.view_Transactions using DateVersion as
the incremental cursor.  Saves each run as a timestamped Parquet file under
data/raw/transactions/ and advances the watermark in watermarks.db.

Run from the project root:
    python -m src.extract.incremental_transactions

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password
"""
from __future__ import annotations

import os
import sqlite3
import pyodbc
import pandas as pd
from datetime import datetime, UTC
from pathlib import Path

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
SERVER   = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT     = 1433
DATABASE = "isbets_bi"
USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

VIEW_NAME     = "Dwh_en.view_Transactions"
CURSOR_COLUMN = "DateVersion"

COLUMNS = [
    "TransactionID",
    "UserID",
    "SubjectID",
    "ReasonID",
    "TransactionManagementStatusID",
    "TransactionManagementStatus",
    "Amount",
    "Date",
    "BalanceAtLastTransaction",
    "TransactionAmountTypeID",
    "TransactionAmountType",
    "CurrencyID",
    "CurrencyExchangeID",
    "Description",
    "DateVersion",
    "DetailDateVersion",
]

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={SERVER},{PORT};"
    f"DATABASE={DATABASE};"
    f"UID={USERNAME};"
    f"PWD={PASSWORD};"
    "Encrypt=yes;"
    "TrustServerCertificate=yes;"
    "Connection Timeout=30;"
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "transactions"

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Read current watermark (INSERT OR IGNORE so first run works)
    with sqlite3.connect(WATERMARK_DB) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?)",
            (VIEW_NAME, "1970-01-01 00:00:00", datetime.now(UTC).isoformat(timespec="seconds")),
        )
        conn.commit()
        cur.execute("SELECT last_value FROM watermarks WHERE view_name = ?", (VIEW_NAME,))
        last_value = cur.fetchone()[0]

    print(f"[transactions] Current watermark: {last_value}")

    cols_sql = ", ".join(COLUMNS)
    query = f"""
        SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql}
        FROM {VIEW_NAME}
        WHERE {CURSOR_COLUMN} > ?
    """

    with pyodbc.connect(SQL_CONN_STR) as conn:
        df = pd.read_sql(query, conn, params=[last_value])

    print(f"[transactions] Rows pulled: {len(df)}")

    if df.empty:
        print("[transactions] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"transactions_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[transactions] Saved to {out_file}")

    new_watermark = df["__cursor__"].max()
    with sqlite3.connect(WATERMARK_DB) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE watermarks SET last_value = ?, updated_at = ? WHERE view_name = ?",
            (str(new_watermark), datetime.now(UTC).isoformat(timespec="seconds"), VIEW_NAME),
        )
        conn.commit()

    print(f"[transactions] Updated watermark to: {new_watermark}")


if __name__ == "__main__":
    main()
