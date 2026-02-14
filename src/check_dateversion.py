import os
import pyodbc

SERVER = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT = 1433
DATABASE = "isbets_bi"

USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

VIEWS = [
    "Dwh_en.view_users",
    "Dwh_en.view_payments",
    "Dwh_en.view_betslips",
    "Dwh_en.view_casino",
    "Dwh_en.view_bonustransactions",
    "Dwh_en.view_bonuscampaigns",
    "Dwh_en.view_bonusbalances",
]

conn_str = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={SERVER},{PORT};"
    f"DATABASE={DATABASE};"
    f"UID={USERNAME};"
    f"PWD={PASSWORD};"
    "Encrypt=yes;"
    "TrustServerCertificate=yes;"
    "Connection Timeout=30;"
)

sql = """
SELECT c.name
FROM sys.columns c
JOIN sys.objects o ON c.object_id = o.object_id
JOIN sys.schemas s ON o.schema_id = s.schema_id
WHERE s.name = ? AND o.name = ?
ORDER BY c.column_id;
"""

with pyodbc.connect(conn_str) as conn:
    cur = conn.cursor()
    for full in VIEWS:
        schema, name = full.split(".", 1)
        cur.execute(sql, (schema, name))
        cols = [r[0] for r in cur.fetchall()]
        has = any(c.lower() == "dateversion" for c in cols)
        print(f"{full}: DateVersion={'YES' if has else 'NO'}")
