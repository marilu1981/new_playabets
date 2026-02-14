import sqlite3
from datetime import datetime

DB_PATH = "watermarks.db"

DEFAULTS = [
    ("Dwh_en.view_users", "DateVersion", "1900-01-01 00:00:00"),
    ("Dwh_en.view_betslips", "DateVersion", "1900-01-01 00:00:00"),
    ("Dwh_en.view_payments", "paymentenddate", "1900-01-01 00:00:00"),
    ("Dwh_en.view_casino", "insertdate", "1900-01-01 00:00:00"),
    ("Dwh_en.view_bonustransactions", "date", "1900-01-01 00:00:00"),
    ("Dwh_en.view_bonuscampaigns", "insertdate", "1900-01-01 00:00:00"),
]

with sqlite3.connect(DB_PATH) as conn:
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS watermarks (
        view_name TEXT PRIMARY KEY,
        cursor_column TEXT NOT NULL,
        last_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """)
    now = datetime.utcnow().isoformat(timespec="seconds")
    for view_name, cursor_column, last_value in DEFAULTS:
        cur.execute("""
        INSERT INTO watermarks(view_name, cursor_column, last_value, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(view_name) DO NOTHING
        """, (view_name, cursor_column, last_value, now))
    conn.commit()

print("Initialized watermarks.db")
