import os, pyodbc

SERVER="playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT=1433
DATABASE="isbets_bi"
USERNAME=os.environ["DWH_USER"]
PASSWORD=os.environ["DWH_PASS"]

conn_str=(
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={SERVER},{PORT};"
    f"DATABASE={DATABASE};"
    f"UID={USERNAME};PWD={PASSWORD};"
    "Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=30;"
)

with pyodbc.connect(conn_str) as conn:
    cur = conn.cursor()
    cur.execute("""
        SELECT c.name, t.name
        FROM sys.columns c
        JOIN sys.objects o ON c.object_id=o.object_id
        JOIN sys.schemas s ON o.schema_id=s.schema_id
        JOIN sys.types t ON c.user_type_id=t.user_type_id
        WHERE s.name='Dwh_en' AND o.name='view_payments'
        ORDER BY c.column_id;
    """)
    rows = cur.fetchall()
    print("Dwh_en.view_payments columns:")
    for name, typ in rows:
        print(f"- {name} ({typ})")

    # 5 rows to for type/status columns
    cur.execute("SELECT TOP 5 * FROM Dwh_en.view_payments ORDER BY paymentenddate DESC;")
    cols = [c[0] for c in cur.description]
    print("\nTop 5 sample rows (showing first 15 columns):")
    for r in cur.fetchall():
        print(dict(zip(cols[:15], r[:15])))
