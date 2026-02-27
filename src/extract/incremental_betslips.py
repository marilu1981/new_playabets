"""
incremental_betslips.py
------------------------
Pulls new/updated rows from Dwh_en.view_BetSlips incrementally via DateVersion.

Run from the project root:
    python -m src.extract.incremental_betslips

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

VIEW_NAME     = "Dwh_en.view_betslips"
CURSOR_COLUMN = "DateVersion"

COLUMNS = [
    "BetSlipID", "UserID", "BookmakerID",
    "PlacementDate", "PaymentDate",
    "Stake", "Winnings", "UserWinnings",
    "BetslipStatus", "OutcomeType", "BetslipType", "CreditType",
    "DateVersion", "DetailDateVersion",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "betslips"

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    last_value = get_watermark(WATERMARK_DB, VIEW_NAME)
    print(f"[betslips] Current watermark: {last_value}")

    cols_sql = ", ".join(COLUMNS)
    query = text(f"""
        SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql}
        FROM {VIEW_NAME}
        WHERE {CURSOR_COLUMN} > :last_value
    """)

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"last_value": last_value})

    print(f"[betslips] Rows pulled: {len(df)}")
    if df.empty:
        print("[betslips] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"betslips_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[betslips] Saved to {out_file}")

    set_watermark(WATERMARK_DB, VIEW_NAME, str(df["__cursor__"].max()))
    print(f"[betslips] Updated watermark to: {df['__cursor__'].max()}")


if __name__ == "__main__":
    main()
