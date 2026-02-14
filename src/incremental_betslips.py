import os
import sqlite3
import pyodbc
import pandas as pd
from datetime import datetime, UTC

SERVER = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT = 1433
DATABASE = "isbets_bi"

USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

VIEW_NAME = "Dwh_en.view_betslips"
CURSOR_COLUMN = "dateversion"  # confirmed

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

WATERMARK_DB = "data/watermarks.db"

with sqlite3.connect(WATERMARK_DB) as conn:
    cur = conn.cursor()
    cur.execute("SELECT last_value FROM watermarks WHERE view_name = ?", (VIEW_NAME,))
    last_value = cur.fetchone()[0]

print(f"Current watermark: {last_value}")

query = f"""
SELECT
    {CURSOR_COLUMN} AS __cursor__,
    betslipid,
    userid,
    bookmakerid,
    placementdate,
    paymentdate,
    stake,
    winnings,
    UserWinnings,
    betslipstatus,
    outcometype,
    BetslipType,
    CreditType
    
FROM {VIEW_NAME}
WHERE {CURSOR_COLUMN} > ?
"""

with pyodbc.connect(SQL_CONN_STR) as conn:
    df = pd.read_sql(query, conn, params=[last_value])

print(f"Rows pulled: {len(df)}")
if len(df) == 0:
    print("No new data.")
    raise SystemExit(0)

out_dir = "data/raw/betslips"
filename = f"{out_dir}/betslips_increment_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}.parquet"
df.to_parquet(filename, index=False)
print(f"Saved to {filename}")

new_watermark = df["__cursor__"].max()
with sqlite3.connect(WATERMARK_DB) as conn:
    cur = conn.cursor()
    cur.execute(
        "UPDATE watermarks SET last_value=?, updated_at=? WHERE view_name=?",
        (str(new_watermark), datetime.now(UTC).isoformat(timespec="seconds"), VIEW_NAME),
    )
    conn.commit()

print(f"Updated watermark to: {new_watermark}")
