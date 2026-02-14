import sqlite3
from datetime import datetime, timedelta, UTC

# Use same path as incremental_users.py and set_betslips_safe_watermark.py
WATERMARK_DB = "data/watermarks.db"
VIEW_NAME = "Dwh_en.view_users"
CURSOR_COLUMN = "DateVersion"

past14Days = (datetime.now(UTC) - timedelta(days=14)).isoformat(timespec="seconds")
now = datetime.now(UTC).isoformat(timespec="seconds")

with sqlite3.connect(WATERMARK_DB) as conn:
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS watermarks (
            view_name TEXT PRIMARY KEY,
            cursor_column TEXT NOT NULL,
            last_value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    cur.execute("""
        INSERT INTO watermarks(view_name, cursor_column, last_value, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(view_name) DO UPDATE SET
            last_value = excluded.last_value,
            updated_at = excluded.updated_at
    """, (VIEW_NAME, CURSOR_COLUMN, past14Days, now))
    conn.commit()

print(f"Watermark set to {past14Days}")
