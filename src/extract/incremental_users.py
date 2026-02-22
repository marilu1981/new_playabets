"""
incremental_users.py
---------------------
Pulls new/updated rows from Dwh_en.view_users incrementally via DateVersion.

Run from the project root:
    python -m src.extract.incremental_users

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password
"""
from __future__ import annotations

import os
import sqlite3
import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
SERVER   = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT     = 1433
DATABASE = "isbets_bi"
USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

VIEW_NAME     = "Dwh_en.view_users"
CURSOR_COLUMN = "DateVersion"

COLUMNS = [
    "userid",
    "userstatus",
    "testuser",
    "usertype",
    "lastlogin",
    "countryid",
    "country",
    "city",
    "zipcode",
    "creationdate",
    "dateversion",
    "detaildateversion",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "users"

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _build_engine():
    """Return a SQLAlchemy engine for SQL Server via pyodbc."""
    params = quote_plus(
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={SERVER},{PORT};"
        f"DATABASE={DATABASE};"
        f"UID={USERNAME};"
        f"PWD={PASSWORD};"
        "Encrypt=yes;"
        "TrustServerCertificate=yes;"
        "Connection Timeout=30;"
    )
    return create_engine(f"mssql+pyodbc:///?odbc_connect={params}", fast_executemany=True)


def _get_watermark(view_name: str) -> str:
    WATERMARK_DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(WATERMARK_DB) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS watermarks "
            "(view_name TEXT PRIMARY KEY, last_value TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        conn.execute(
            "INSERT OR IGNORE INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?)",
            (view_name, "1970-01-01 00:00:00", datetime.now(UTC).isoformat(timespec="seconds")),
        )
        conn.commit()
        cur = conn.execute("SELECT last_value FROM watermarks WHERE view_name = ?", (view_name,))
        return cur.fetchone()[0]


def _set_watermark(view_name: str, value: str) -> None:
    with sqlite3.connect(WATERMARK_DB) as conn:
        conn.execute(
            "UPDATE watermarks SET last_value = ?, updated_at = ? WHERE view_name = ?",
            (value, datetime.now(UTC).isoformat(timespec="seconds"), view_name),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    last_value = _get_watermark(VIEW_NAME)
    print(f"[users] Current watermark: {last_value}")

    cols_sql = ", ".join(COLUMNS)
    query = text(f"""
        SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql}
        FROM {VIEW_NAME}
        WHERE {CURSOR_COLUMN} > :last_value
    """)

    engine = _build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"last_value": last_value})

    print(f"[users] Rows pulled: {len(df)}")
    if df.empty:
        print("[users] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"users_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[users] Saved to {out_file}")

    new_watermark = str(df["__cursor__"].max())
    _set_watermark(VIEW_NAME, new_watermark)
    print(f"[users] Updated watermark to: {new_watermark}")


if __name__ == "__main__":
    main()
