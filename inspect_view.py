"""
inspect_view.py
---------------
Prints the column names and data types of any DWH view.

Usage (VPN connected):
    python inspect_view.py Dwh_en.view_payments
    python inspect_view.py Dwh_en.view_betslips
"""
import sys
sys.path.insert(0, ".")

from src.extract.db_utils import build_engine
from sqlalchemy import text

if len(sys.argv) < 2:
    print("Usage: python inspect_view.py <schema.view_name>")
    sys.exit(1)

full_name = sys.argv[1]
if "." in full_name:
    schema, view = full_name.split(".", 1)
else:
    schema, view = "Dwh_en", full_name

print(f"\nConnecting to DWH...")
engine = build_engine()

with engine.connect() as conn:
    rows = conn.execute(text(
        "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH "
        "FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :view "
        "ORDER BY ORDINAL_POSITION"
    ), {"schema": schema, "view": view}).fetchall()

if not rows:
    print(f"\nNo columns found for {schema}.{view} — check the name is correct.\n")
    sys.exit(1)

print(f"\nColumns in {schema}.{view} ({len(rows)} columns):\n")
print(f"  {'Column':<40} {'Type'}")
print("  " + "-" * 55)
for col, dtype, maxlen in rows:
    type_str = f"{dtype}({maxlen})" if maxlen else dtype
    print(f"  {col:<40} {type_str}")
print()
