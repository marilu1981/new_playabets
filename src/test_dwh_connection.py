import os
import pyodbc

SERVER = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT = 1433
DATABASE = "master"

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

print("Connecting...")
with pyodbc.connect(conn_str) as conn:
    cur = conn.cursor()
    cur.execute("SELECT @@VERSION;")
    print("Connected.")
    print(cur.fetchone()[0])
