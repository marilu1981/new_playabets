"""
incremental_users.py
---------------------
Pulls new/updated rows from Dwh_en.view_users incrementally via DateVersion.
Also enriches each exported user row with current balance fields from
Dwh_en.view_balances.

Run from the project root:
    python -m src.extract.incremental_users

Environment variables required:
    DWH_USER  - SQL Server login
    DWH_PASS  - SQL Server password
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from sqlalchemy import text

from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME = "Dwh_en.view_users"
BALANCES_VIEW = "Dwh_en.view_balances"
CURSOR_COLUMN = "DateVersion"

# Keep stable, lowercase output column names for downstream transforms.
SELECT_COLUMNS = [
    "u.userid AS userid",
    "u.userstatus AS userstatus",
    "u.testuser AS testuser",
    "u.usertype AS usertype",
    "u.userprofileid AS userprofileid",
    "u.userprofile AS userprofile",
    "u.lastlogin AS lastlogin",
    "u.province AS province",
    "u.countryid AS countryid",
    "u.country AS country",
    "u.city AS city",
    "u.zipcode AS zipcode",
    "u.creationdate AS creationdate",
    "u.dateversion AS dateversion",
    "u.detaildateversion AS detaildateversion",
    "b.balance AS balance",
    "b.credit AS credit",
    "b.lasttransactiondate AS lasttransactiondate",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR = PROJECT_ROOT / "data" / "raw" / "users"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    last_value = get_watermark(WATERMARK_DB, VIEW_NAME)
    print(f"[users] Current watermark: {last_value}")

    cols_sql = ", ".join(SELECT_COLUMNS)
    query = text(
        f"""
        SELECT
            u.{CURSOR_COLUMN} AS __cursor__,
            {cols_sql}
        FROM {VIEW_NAME} u
        LEFT JOIN {BALANCES_VIEW} b
            ON b.UserID = u.UserID
        WHERE u.{CURSOR_COLUMN} > :last_value
        """
    )

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"last_value": last_value})

    print(f"[users] Rows pulled: {len(df)}")
    if df.empty:
        print("[users] No new data.")
        return

    creation_col = next((c for c in df.columns if c.lower() == "creationdate"), None)
    if creation_col:
        creation_dt = pd.to_datetime(df[creation_col], errors="coerce")
        print(
            "[users] creationdate non-null=%d, min=%s, max=%s"
            % (
                int(creation_dt.notna().sum()),
                str(creation_dt.min()),
                str(creation_dt.max()),
            )
        )

    user_col = next((c for c in df.columns if c.lower() == "userid"), None)
    if user_col:
        print(f"[users] unique userids in batch: {int(df[user_col].nunique(dropna=True))}")

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"users_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[users] Saved to {out_file}")

    new_watermark = str(df["__cursor__"].max())
    set_watermark(WATERMARK_DB, VIEW_NAME, new_watermark)
    print(f"[users] Updated watermark to: {new_watermark}")


if __name__ == "__main__":
    main()
