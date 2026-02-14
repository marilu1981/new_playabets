import os
import pyodbc

SERVER = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT = 1433
DATABASE = "isbets_bi"

USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

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

VIEW = "Dwh_en.view_betslips"

with pyodbc.connect(SQL_CONN_STR) as conn:
    cur = conn.cursor()

    # columns (names only)
    cur.execute("""
        SELECT c.name
        FROM sys.columns c
        JOIN sys.objects o ON c.object_id = o.object_id
        JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE s.name = 'Dwh_en' AND o.name = 'view_betslips'
        ORDER BY c.column_id;
    """)
    cols = [r[0] for r in cur.fetchall()]
    print(f"{VIEW} columns ({len(cols)}):")
    print(", ".join(cols))

    # 2) Sample - DateVersion range + count last 7 days updates
    cur.execute(f"""
        SELECT
          COUNT(*) AS rows_7d,
          MIN(DateVersion) AS min_dv,
          MAX(DateVersion) AS max_dv
        FROM {VIEW}
        WHERE DateVersion >= DATEADD(day, -7, GETDATE());
    """)
    r = cur.fetchone()
    print("\nLast 7 days by DateVersion:")
    print(f"rows_7d={r[0]}, min={r[1]}, max={r[2]}")

    # Top 5 DateVersion values to confirm format
    cur.execute(f"SELECT TOP 5 DateVersion FROM {VIEW} ORDER BY DateVersion DESC;")
    print("\nTop 5 DateVersion values:")
    for row in cur.fetchall():
        print("-", row[0])
