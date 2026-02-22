"""
list_views.py
-------------
Lists all views in the Dwh_en schema so we can verify the exact names.

Usage (VPN connected):
    python list_views.py
"""
import sys
sys.path.insert(0, ".")

from src.extract.db_utils import build_engine
from sqlalchemy import text

print("\nConnecting to DWH...")
engine = build_engine()

with engine.connect() as conn:
    rows = conn.execute(text(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS "
        "WHERE TABLE_SCHEMA = 'Dwh_en' ORDER BY TABLE_NAME"
    )).fetchall()

print(f"\nFound {len(rows)} views in Dwh_en:\n")
for r in rows:
    print(f"  Dwh_en.{r[0]}")
print()
