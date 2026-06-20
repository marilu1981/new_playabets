"""Quick diagnostic: show May 2026 totals per ReasonID from view_transactions."""
from sqlalchemy import text
from src.extract.db_utils import build_engine

engine = build_engine()
with engine.connect() as conn:
    r = conn.execute(text("""
        SELECT ReasonID, TransactionAmountTypeID,
               SUM(ABS(CAST(Amount AS FLOAT))) AS total,
               COUNT(*) AS cnt
        FROM Dwh_en.view_transactions
        WHERE Date >= '2026-05-01 00:00:00'
          AND Date <  '2026-06-01 00:00:00'
          AND TransactionManagementStatusID = 3
          AND ReasonID IN (248,249,250,830,835,839,843,851,853,855,857,859,
                           861,863,865,867,869,871,873,875,877,939,
                           251,252,253,254,831,833,837,841,845,847,849,
                           838,842,846,848,850)
        GROUP BY ReasonID, TransactionAmountTypeID
        ORDER BY ReasonID
    """))
    print(f"{'ReasonID':>10}  {'TypeID':>7}  {'Total':>20}  {'Count':>8}")
    print("-" * 55)
    for row in r:
        print(f"{row[0]:>10}  {row[1]:>7}  {row[2]:>20,.0f}  {row[3]:>8}")

if __name__ == "__main__":
    pass
