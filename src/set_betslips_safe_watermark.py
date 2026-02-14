import sqlite3
from datetime import datetime, timedelta, UTC

DB = "data/watermarks.db"
VIEW = "Dwh_en.view_betslips"

seven_days_ago = (datetime.now(UTC) - timedelta(days=7)).isoformat(timespec="seconds")

with sqlite3.connect(DB) as conn:
    cur = conn.cursor()
    cur.execute("""
        INSERT OR IGNORE INTO watermarks(view_name, cursor_column, last_value, updated_at)
        VALUES (?, ?, ?, ?)
    """, (VIEW, "dateversion", seven_days_ago, datetime.now(UTC).isoformat(timespec="seconds")))
    cur.execute("""
        UPDATE watermarks
        SET last_value = ?, updated_at = ?
        WHERE view_name = ?
    """, (seven_days_ago, datetime.now(UTC).isoformat(timespec="seconds"), VIEW))
    conn.commit()

print("Betslips watermark set to:", seven_days_ago)
