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
from pathlib import Path
from sqlalchemy import text

from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME     = "Dwh_en.view_Casino"
CURSOR_COLUMN = "InsertDate"

COLUMNS = [
    "CasinoID", "ProviderID", "ProviderName", "BookmakerProviderName",
    "CasinoTypeID", "CasinoType", "UserID", "PlacementDate",
    "BetsNumber", "Stake", "Winnings", "Tips", "Tournament",
    "Bonus", "Jackpot", "InsertDate", "CurrencyID",
    "ThirdpartiesStake", "ThirdpartiesWinnings",
    "JackpotContribution", "ThirdpartiesJackpotContribution",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "casino"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = get_watermark(WATERMARK_DB, VIEW_NAME)
    print(f"[casino] Current watermark: {last_value}")

    cols_sql = ", ".join(COLUMNS)
    query = text(
        f"SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql} "
        f"FROM {VIEW_NAME} WHERE {CURSOR_COLUMN} > :last_value"
    )

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"last_value": last_value})

    print(f"[casino] Rows pulled: {len(df)}")
    if df.empty:
        print("[casino] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"casino_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[casino] Saved to {out_file}")
    set_watermark(WATERMARK_DB, VIEW_NAME, str(df["__cursor__"].max()))
    print(f"[casino] Updated watermark to: {df['__cursor__'].max()}")


if __name__ == "__main__":
    main()
