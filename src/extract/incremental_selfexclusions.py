"""
incremental_selfexclusions.py
-----------------------------
Exports self-exclusion data from:
  - Dwh_en.view_UsersSelfexclusions            (full-refresh current snapshot)
  - Dwh_en.view_UsersSelfexclusionsHistorical  (incremental via InsertDate)

Run from the project root:
    python -m src.extract.incremental_selfexclusions
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

CURRENT_VIEW = "Dwh_en.view_usersselfexclusions"
HISTORICAL_VIEW = "Dwh_en.view_usersselfexclusionshistorical"
CURSOR_COLUMN = "InsertDate"

CURRENT_COLUMNS = [
    "UserId",
    "SelfExclusionTypeId",
    "SelfExclusionType",
    "SelfExclusionPeriodId",
    "SelfExclusionPeriod",
    "SelfExclusionStatusId",
    "SelfExclusionStatus",
    "StartDate",
    "OldUserStatusId",
    "OldUserStatus",
    "LogicTypeId",
    "LogicType",
]

HISTORICAL_COLUMNS = [
    "HistoryId",
    "UserId",
    "SelfExclusionTypeId",
    "SelfExclusionType",
    "SelfExclusionPeriodId",
    "SelfExclusionPeriod",
    "SelfExclusionStatusId",
    "SelfExclusionStatus",
    "StartDate",
    "InsertDate",
    "ManagerInsertionSessionId",
    "UserInsertionId",
    "ApplicationTypeId",
    "ApplicationType",
    "OldUserStatusId",
    "OldUserStatus",
    "LogicTypeId",
    "LogicType",
]

WATERMARK_DB = WATERMARK_DB_PATH
OUT_DIR = raw_dir("selfexclusions")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    engine = build_engine()
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")

    print("[selfexclusions] Pulling current snapshot (full-refresh)...")
    current_cols_sql = ", ".join(CURRENT_COLUMNS)
    with engine.connect() as conn:
        df_current = pd.read_sql(text(f"SELECT {current_cols_sql} FROM {CURRENT_VIEW}"), conn)
    print(f"[selfexclusions] Current rows: {len(df_current)}")
    df_current.to_parquet(OUT_DIR / "selfexclusions_current_latest.parquet", index=False)

    last_value = get_watermark(WATERMARK_DB, HISTORICAL_VIEW)
    print(f"[selfexclusions] Historical watermark: {last_value}")
    hist_cols_sql = ", ".join(HISTORICAL_COLUMNS)
    query = text(
        f"""
        SELECT
            {CURSOR_COLUMN} AS __cursor__,
            {hist_cols_sql}
        FROM {HISTORICAL_VIEW}
        WHERE {CURSOR_COLUMN} > :last_value
          AND {CURSOR_COLUMN} IS NOT NULL
        ORDER BY {CURSOR_COLUMN}
        """
    )

    with engine.connect() as conn:
        df_hist = pd.read_sql(query, conn, params={"last_value": last_value})

    print(f"[selfexclusions] Historical rows: {len(df_hist)}")
    if not df_hist.empty:
        df_hist.to_parquet(OUT_DIR / f"selfexclusions_history_increment_{ts}.parquet", index=False)
        new_watermark = str(df_hist["__cursor__"].max())
        set_watermark(WATERMARK_DB, HISTORICAL_VIEW, new_watermark)
        print(f"[selfexclusions] Updated watermark to: {new_watermark}")

    print(f"[selfexclusions] Done. Files written to {OUT_DIR}")


if __name__ == "__main__":
    main()
