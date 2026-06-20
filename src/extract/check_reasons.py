"""
Diagnostic: show May 2026 totals per ReasonID from view_transactions,
joined with view_Reasons so we can see the DWH's own classification
(ReasonGroup) for each code.
"""
from sqlalchemy import text
from src.extract.db_utils import build_engine

engine = build_engine()
with engine.connect() as conn:
    # First: get the DWH's own reason group classification
    print("\n=== Reason Group Classification from view_Reasons ===")
    rg = conn.execute(text("""
        SELECT ReasonID, Reason, ReasonGroupID, ReasonGroup
        FROM Dwh_en.view_Reasons
        WHERE ReasonID IN (248,249,250,830,835,839,843,851,853,855,857,859,
                           861,863,865,867,869,871,873,875,877,939,
                           251,252,253,254,831,833,837,841,845,847,849,
                           838,842,846,848,850)
        ORDER BY ReasonGroupID, ReasonID
    """))
    print(f"{'ReasonID':>10}  {'ReasonGroupID':>14}  {'ReasonGroup':>25}  Reason")
    print("-" * 80)
    for row in rg:
        print(f"{row[0]:>10}  {row[2]:>14}  {row[3]:>25}  {row[1]}")

    # Second: May 2026 amounts per reason + TypeID
    print("\n=== May 2026 Amounts per ReasonID + TypeID (Accepted only) ===")
    r = conn.execute(text("""
        SELECT t.ReasonID, t.TransactionAmountTypeID,
               rr.ReasonGroup,
               SUM(ABS(CAST(t.Amount AS FLOAT))) AS total,
               COUNT(*) AS cnt
        FROM Dwh_en.view_transactions t
        LEFT JOIN Dwh_en.view_Reasons rr ON t.ReasonID = rr.ReasonID
        WHERE t.Date >= '2026-05-01 00:00:00'
          AND t.Date <  '2026-06-01 00:00:00'
          AND t.TransactionManagementStatusID = 3
          AND t.ReasonID IN (248,249,250,830,835,839,843,851,853,855,857,859,
                           861,863,865,867,869,871,873,875,877,939,
                           251,252,253,254,831,833,837,841,845,847,849,
                           838,842,846,848,850)
        GROUP BY t.ReasonID, t.TransactionAmountTypeID, rr.ReasonGroup
        ORDER BY t.ReasonID
    """))
    print(f"{'ReasonID':>10}  {'TypeID':>7}  {'ReasonGroup':>20}  {'Total':>20}  {'Count':>8}")
    print("-" * 75)
    for row in r:
        print(f"{row[0]:>10}  {row[1]:>7}  {row[2] or '':>20}  {row[3]:>20,.0f}  {row[4]:>8}")

if __name__ == "__main__":
    pass
