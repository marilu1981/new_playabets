import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sqlalchemy import text
from src.extract.db_utils import build_engine

engine = build_engine()
with engine.connect() as conn:
    print("=== May 2026 per-ReasonID totals (TransactionManagementStatusID=3, Accepted) ===")
    r = conn.execute(text("""
        SELECT t.ReasonID, rr.ReasonGroup, rr.Reason,
               t.TransactionAmountTypeID,
               SUM(ABS(CAST(t.Amount AS FLOAT))) AS total,
               COUNT(*) AS cnt
        FROM Dwh_en.view_transactions t
        LEFT JOIN Dwh_en.view_Reasons rr ON t.ReasonID = rr.ReasonID
        WHERE t.Date >= '2026-05-01 00:00:00'
          AND t.Date <  '2026-06-01 00:00:00'
          AND t.TransactionManagementStatusID = 3
          AND rr.ReasonGroupID IN (2,3)
        GROUP BY t.ReasonID, rr.ReasonGroup, rr.Reason, t.TransactionAmountTypeID
        ORDER BY rr.ReasonGroupID, t.ReasonID
    """))
    dep_total = 0.0
    wd_total = 0.0
    for row in r:
        rid, grp, reason, tid, total, cnt = row
        print(f"  {rid:>5} | {grp:>12} | TypeID={tid} | {total:>18,.2f} | {cnt:>7} | {reason}")
        if grp == "Deposit":
            dep_total += total
        elif grp == "Withdrawals":
            wd_total += total
    print(f"\n  ALL Group2 Deposits total:    {dep_total:>18,.2f}")
    print(f"  ALL Group3 Withdrawals total: {wd_total:>18,.2f}")
    print(f"  Net (all dep - all wd):       {dep_total - wd_total:>18,.2f}")
    print(f"\n  Client target net: 9,945,163")
