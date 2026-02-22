"""
incremental_users.py
---------------------
Pulls new/updated rows from Dwh_en.view_users incrementally via DateVersion.

Run from the project root:
    python -m src.extract.incremental_users

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from sqlalchemy import text

from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME     = "Dwh_en.view_users"
CURSOR_COLUMN = "DateVersion"

COLUMNS = [
    "userid",
    "userstatus",
    "testuser",
    "usertype",
    "lastlogin",
    "countryid",
    "country",
    "city",
    "zipcode",
    "creationdate",
    "dateversion",
    "detaildateversion",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "users"

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    last_value = get_watermark(WATERMARK_DB, VIEW_NAME)
    print(f"[users] Current watermark: {last_value}")

    cols_sql = ", ".join(COLUMNS)
    query = text(f"""
        SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql}
        FROM {VIEW_NAME}
        WHERE {CURSOR_COLUMN} > :last_value
    """)

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"last_value": last_value})

    print(f"[users] Rows pulled: {len(df)}")
    if df.empty:
        print("[users] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"users_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[users] Saved to {out_file}")

    new_watermark = str(df["__cursor__"].max())
    set_watermark(WATERMARK_DB, VIEW_NAME, new_watermark)
    print(f"[users] Updated watermark to: {new_watermark}")


if __name__ == "__main__":
    main()
