from src.extract.db_utils import build_engine
from sqlalchemy import text
import pandas as pd

engine = build_engine()
with engine.connect() as conn:
    print("=== view_transactions (TOP 5) ===")
    df = pd.read_sql(text("SELECT TOP 5 * FROM Dwh_en.view_transactions"), conn)
    print(df.to_string())
    print()
    print(df.dtypes)

    print("\n=== view_Reasons (ALL) ===")
    df2 = pd.read_sql(text("SELECT * FROM Dwh_en.view_Reasons"), conn)
    print(df2.to_string())
