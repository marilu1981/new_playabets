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
from datetime import datetime, timedelta, UTC

import pyodbc
from sqlalchemy import create_engine


def _default_watermark() -> str:
    """
    Return the default start date for the first incremental pull.
    Defaults to 90 days ago.  Override by setting INITIAL_LOAD_DAYS env var.

    Example:
        set INITIAL_LOAD_DAYS=30   # pull only last 30 days on first run
        set INITIAL_LOAD_DAYS=180  # pull last 6 months on first run
    """
    days = int(os.environ.get("INITIAL_LOAD_DAYS", "90"))
    cutoff = datetime.now(UTC) - timedelta(days=days)
    return cutoff.strftime("%Y-%m-%d %H:%M:%S")

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

def _migrate_watermarks_schema(cur, conn) -> None:
    """
    Migrate the watermarks table from the legacy 4-column schema
    (view_name, cursor_column, last_value, updated_at) to the current
    3-column schema (view_name, last_value, updated_at).
    Runs silently if the table already has the correct schema.
    """
    cur.execute("PRAGMA table_info(watermarks)")
    columns = {row[1] for row in cur.fetchall()}
    if "cursor_column" in columns:
        # Rename old table, create new one, copy data, drop old
        cur.execute("ALTER TABLE watermarks RENAME TO watermarks_old")
        cur.execute(
            "CREATE TABLE watermarks "
            "(view_name TEXT PRIMARY KEY, last_value TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        cur.execute(
            "INSERT INTO watermarks (view_name, last_value, updated_at) "
            "SELECT view_name, last_value, updated_at FROM watermarks_old"
        )
        cur.execute("DROP TABLE watermarks_old")
        conn.commit()


def get_watermark(watermark_db, view_name: str, default: str | None = None) -> str:
    """
    Return the current high-watermark for `view_name`.
    Creates the watermarks table and inserts a default row if needed.
    Automatically migrates the legacy 4-column schema if present.

    Note: watermark_db is cast to str explicitly because sqlite3.connect()
    on Windows does not always accept pathlib.Path objects reliably.
    """
    if default is None:
        default = _default_watermark()

    import pathlib
    db_path = str(pathlib.Path(watermark_db).resolve())
    pathlib.Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        # Ensure table exists with current schema
        cur.execute(
            "CREATE TABLE IF NOT EXISTS watermarks "
            "(view_name TEXT PRIMARY KEY, last_value TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        conn.commit()

        # Migrate legacy schema if needed (adds cursor_column removal)
        _migrate_watermarks_schema(cur, conn)

        # Check if the row already exists
        cur.execute("SELECT last_value FROM watermarks WHERE view_name = ?", (view_name,))
        row = cur.fetchone()
        if row is not None:
            return row[0]

        # Row does not exist — insert the default
        cur.execute(
            "INSERT INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?)",
            (view_name, default, datetime.now(UTC).isoformat(timespec="seconds")),
        )
        conn.commit()
        return default


def set_watermark(watermark_db, view_name: str, value: str) -> None:
    """Update the high-watermark for `view_name`."""
    import pathlib
    db_path = str(pathlib.Path(watermark_db).resolve())
    with sqlite3.connect(db_path) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE watermarks SET last_value = ?, updated_at = ? WHERE view_name = ?",
            (value, datetime.now(UTC).isoformat(timespec="seconds"), view_name),
        )
        conn.commit()
