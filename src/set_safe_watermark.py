import sqlite3
from datetime import datetime, timedelta, UTC

WATERMARK_DB = "watermarks.db"
VIEW_NAME = "Dwh_en.view_users"

past7Days = (datetime.now(UTC) - timedelta(days=7)).isoformat(timespec="seconds")

with sqlite3.connect(WATERMARK_DB) as conn:
    cur = conn.cursor()
    cur.execute(
        "UPDATE watermarks SET last_value = ? WHERE view_name = ?",
        (past7Days, VIEW_NAME)
    )
    conn.commit()

print(f"Watermark set to {past7Days}")
