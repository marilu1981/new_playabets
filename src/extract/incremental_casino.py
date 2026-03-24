"""
incremental_casino.py
----------------------
Pulls new/updated rows from Dwh_en.view_Casino using InsertDate as the
incremental cursor.

Run from the project root:
    python -m src.extract.incremental_casino
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME     = "Dwh_en.view_casino"
CURSOR_COLUMN = "InsertDate"
FORCE_START_DATE = "2025-12-01 00:00:00" # inclusive
FORCE_END_DATE = "2026-01-01 00:00:00" # exclusive
UPDATE_WATERMARK_ON_BACKFILL = False

COLUMNS = [
    "CasinoID", "ProviderID", "ProviderName", "BookmakerProviderName",
    "CasinoTypeID", "CasinoType", "UserID", "PlacementDate",
    "BetsNumber", "Stake", "Winnings", "Tips", "Tournament",
    "Bonus", "Jackpot", "InsertDate", "CurrencyID",
    "ThirdpartiesStake", "ThirdpartiesWinnings",
    "JackpotContribution", "ThirdpartiesJackpotContribution",
]

WATERMARK_DB = WATERMARK_DB_PATH
OUT_DIR = raw_dir("casino")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    saved_watermark = get_watermark(WATERMARK_DB, VIEW_NAME)
    last_value = FORCE_START_DATE or saved_watermark
    print(f"[casino] Current watermark: {saved_watermark}")
    if FORCE_START_DATE:
        print(f"[casino] Backfill start override: {FORCE_START_DATE}")
    if FORCE_END_DATE:
        print(f"[casino] Backfill end override: {FORCE_END_DATE}")

    cols_sql = ", ".join(COLUMNS)
    if FORCE_END_DATE:
        query = text(
            f"SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql} "
            f"FROM {VIEW_NAME} "
            f"WHERE {CURSOR_COLUMN} >= :last_value AND {CURSOR_COLUMN} < :end_value"
        )
        params = {"last_value": last_value, "end_value": FORCE_END_DATE}
    else:
        query = text(
            f"SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql} "
            f"FROM {VIEW_NAME} WHERE {CURSOR_COLUMN} > :last_value"
        )
        params = {"last_value": last_value}

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params=params)

    print(f"[casino] Rows pulled: {len(df)}")
    if df.empty:
        print("[casino] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"casino_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[casino] Saved to {out_file}")
    if FORCE_START_DATE and not UPDATE_WATERMARK_ON_BACKFILL:
        print("[casino] Backfill mode active - saved watermark not updated.")
        return

    set_watermark(WATERMARK_DB, VIEW_NAME, str(df["__cursor__"].max()))
    print(f"[casino] Updated watermark to: {df['__cursor__'].max()}")


if __name__ == "__main__":
    main()
