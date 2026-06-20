import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from src.extract.db_utils import build_engine

engine = build_engine()
with engine.connect() as conn:
    r = conn.execute(text("""
        SELECT ReasonID, Reason, ReasonGroupID, ReasonGroup
        FROM Dwh_en.view_Reasons
        WHERE ReasonID IN (248,249,250,830,835,839,843,851,853,855,857,859,
                           861,863,865,867,869,871,873,875,877,939,
                           251,252,253,254,831,833,837,841,845,847,849,
                           838,842,846,848,850)
        ORDER BY ReasonGroupID, ReasonID
    """))
    print(f"{'ReasonID':>10}  {'GroupID':>8}  {'ReasonGroup':>25}  Reason")
    print("-"*80)
    for row in r:
        print(f"{row[0]:>10}  {row[2]:>8}  {row[3]:>25}  {row[1]}")
