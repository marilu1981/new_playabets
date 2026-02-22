"""
incremental_casino.py
----------------------
Pulls new/updated rows from Dwh_en.view_Casino using InsertDate as the
incremental cursor.

Run from the project root:
    python -m src.extract.incremental_casino

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password
"""
from __future__ import annotations
import os, sqlite3, pyodbc, pandas as pd
from datetime import datetime, UTC
from pathlib import Path

SERVER   = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT     = 1433
DATABASE = "isbets_bi"
USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

VIEW_NAME     = "Dwh_en.view_Casino"
CURSOR_COLUMN = "InsertDate"

COLUMNS = [
    "CasinoID", "ProviderID", "ProviderName", "BookmakerProviderName",
    "CasinoTypeID", "CasinoType", "UserID", "PlacementDate",
    "BetsNumber", "Stake", "Winnings", "Tips", "Tournament",
    "Bonus", "Jackpot", "InsertDate", "CurrencyID",
    "ThirdpartiesStake", "ThirdpartiesWinnings",
    "JackpotContribution", "ThirdpartiesJackpotContribution",
]

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={SERVER},{PORT};"
    f"DATABASE={DATABASE};"
    f"UID={USERNAME};"
    f"PWD={PASSWORD};"
    "Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=30;"
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "casino"


def _get_watermark(view_name: str) -> str:
    with sqlite3.connect(WATERMARK_DB) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?)",
            (view_name, "1970-01-01 00:00:00", datetime.now(UTC).isoformat(timespec="seconds")),
        )
        conn.commit()
        cur.execute("SELECT last_value FROM watermarks WHERE view_name = ?", (view_name,))
        return cur.fetchone()[0]


def _set_watermark(view_name: str, value: str) -> None:
    with sqlite3.connect(WATERMARK_DB) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE watermarks SET last_value = ?, updated_at = ? WHERE view_name = ?",
            (value, datetime.now(UTC).isoformat(timespec="seconds"), view_name),
        )
        conn.commit()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = _get_watermark(VIEW_NAME)
    print(f"[casino] Current watermark: {last_value}")

    cols_sql = ", ".join(COLUMNS)
    query = (
        f"SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql} "
        f"FROM {VIEW_NAME} WHERE {CURSOR_COLUMN} > ?"
    )

    with pyodbc.connect(SQL_CONN_STR) as conn:
        df = pd.read_sql(query, conn, params=[last_value])

    print(f"[casino] Rows pulled: {len(df)}")
    if df.empty:
        print("[casino] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"casino_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[casino] Saved to {out_file}")
    _set_watermark(VIEW_NAME, str(df["__cursor__"].max()))
    print(f"[casino] Updated watermark to: {df['__cursor__'].max()}")


if __name__ == "__main__":
    main()
