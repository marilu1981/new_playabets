import os
import pyodbc

SERVER = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT = 1433
DATABASE = "isbets_bi"

USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

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
SELECT
  s.name AS schema_name,
  v.name AS view_name
FROM sys.views v
JOIN sys.schemas s ON v.schema_id = s.schema_id
WHERE s.name IN ('Dwh_en','Dwh_it','dbo')
ORDER BY s.name, v.name;
"""

with pyodbc.connect(conn_str) as conn:
    cur = conn.cursor()
    cur.execute(sql)
    rows = cur.fetchall()

print("Views in isbets_bi (Dwh_en / Dwh_it / dbo):")
for schema_name, view_name in rows:
    print(f"- {schema_name}.{view_name}")
