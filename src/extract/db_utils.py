"""
db_utils.py
-----------
Shared helpers for all extract scripts.

Fixes applied vs. the original pyodbc approach:
  1. _build_engine: Uses a SQLAlchemy `creator` function that passes the raw
     ODBC connection string directly to pyodbc.connect().  This avoids
     quote_plus() URL-encoding the curly braces in the driver name
     ({ODBC Driver 18 for SQL Server}), which caused error 18456 on Windows.

  2. _get_watermark / _set_watermark: Uses an explicit cursor so that
     conn.execute() return values are handled correctly.  The watermarks
     table is created if it does not exist before the INSERT OR IGNORE,
     preventing the NoneType fetchone() error.
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, UTC

import pyodbc
from sqlalchemy import create_engine

# ── Connection config (read from env) ────────────────────────────────────────
SERVER   = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT     = 1433
DATABASE = "isbets_bi"


def _odbc_conn_str() -> str:
    """Build the raw ODBC connection string from env vars."""
    username = os.environ["DWH_USER"]
    password = os.environ["DWH_PASS"]
    return (
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={SERVER},{PORT};"
        f"DATABASE={DATABASE};"
        f"UID={username};"
        f"PWD={password};"
        "Encrypt=yes;"
        "TrustServerCertificate=yes;"
        "Connection Timeout=30;"
    )


def build_engine():
    """
    Return a SQLAlchemy engine that connects via pyodbc using the raw ODBC
    connection string.  The `creator` pattern bypasses URL encoding so that
    special characters in the driver name and password are preserved exactly.
    """
    conn_str = _odbc_conn_str()

    def creator():
        return pyodbc.connect(conn_str)

    return create_engine("mssql+pyodbc://", creator=creator)


# ── Watermark helpers ─────────────────────────────────────────────────────────

def get_watermark(watermark_db, view_name: str, default: str = "1970-01-01 00:00:00") -> str:
    """
    Return the current high-watermark for `view_name`.
    Creates the watermarks table and inserts a default row if needed.
    """
    watermark_db.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(watermark_db) as conn:
        cur = conn.cursor()
        cur.execute(
            "CREATE TABLE IF NOT EXISTS watermarks "
            "(view_name TEXT PRIMARY KEY, last_value TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        cur.execute(
            "INSERT OR IGNORE INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?)",
            (view_name, default, datetime.now(UTC).isoformat(timespec="seconds")),
        )
        conn.commit()
        cur.execute("SELECT last_value FROM watermarks WHERE view_name = ?", (view_name,))
        row = cur.fetchone()
        if row is None:
            raise RuntimeError(
                f"Watermark row for '{view_name}' not found even after INSERT OR IGNORE. "
                "Check that the watermarks.db path is correct."
            )
        return row[0]


def set_watermark(watermark_db, view_name: str, value: str) -> None:
    """Update the high-watermark for `view_name`."""
    with sqlite3.connect(watermark_db) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE watermarks SET last_value = ?, updated_at = ? WHERE view_name = ?",
            (value, datetime.now(UTC).isoformat(timespec="seconds"), view_name),
        )
        conn.commit()
