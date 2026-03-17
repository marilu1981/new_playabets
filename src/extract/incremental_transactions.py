"""
incremental_transactions.py
----------------------------
Pulls rows from Dwh_en.view_transactions using a Date window to find
TransactionID bounds, then fetches by TransactionID index.

View columns (from DWH Technical Documentation v19):
  TransactionID, UserID, SubjectID, ReasonID,
  TransactionManagementStatusID, TransactionManagementStatus,
  Amount, Date, BalanceAtLastTransaction,
  TransactionAmountTypeID, TransactionAmountType,
  CurrencyID, CurrencyExchangeID, Description, Notes,
  ManagerID, ManagerUsername, DateVersion

Run from the project root:
    python -m src.extract.incremental_transactions

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password
"""
from __future__ import annotations

import os
import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from sqlalchemy import text
from pandas.errors import DatabaseError

from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME     = "Dwh_en.view_transactions"
CURSOR_COLUMN = "Date"

COLUMNS = [
    "TransactionID", "UserID", "SubjectID", "ReasonID",
    "TransactionManagementStatusID", "TransactionManagementStatus",
    "Amount", "Date", "BalanceAtLastTransaction",
    "TransactionAmountTypeID", "TransactionAmountType",
    "CurrencyID", "CurrencyExchangeID", "Description", "Notes",
    "ManagerID", "ManagerUsername", "DateVersion",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks_transactions.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "transactions"

# Optional backfill controls. Leave unset for normal incremental mode.
BACKFILL_START_DATE = os.environ.get("TX_BACKFILL_START_DATE")
BACKFILL_END_DATE = os.environ.get("TX_BACKFILL_END_DATE")
BACKFILL_UPDATE_WATERMARK = os.environ.get("TX_BACKFILL_UPDATE_WATERMARK", "0") == "1"
CHUNK_SIZE = 100_000


def _resolve_window(saved_watermark: str) -> tuple[str, str | None, bool]:
    """
    Return (start_value, end_value, update_watermark).

    Normal incremental mode uses the saved watermark and updates it.
    Backfill mode is opt-in via env vars and, by default, does not advance the
    saved watermark so one-off replays do not disturb steady-state loads.
    """
    if BACKFILL_START_DATE:
        return BACKFILL_START_DATE, BACKFILL_END_DATE, BACKFILL_UPDATE_WATERMARK
    return saved_watermark, None, True


def _describe_db_error(step: str, exc: Exception) -> None:
    msg = str(exc).lower()
    if "timeout" in msg or "hyt00" in msg:
        print(
            f"[transactions] {step} timed out. "
            "Try a narrower date window or increase DWH_QUERY_TIMEOUT_SECONDS."
        )
    elif "08s01" in msg or "communication link failure" in msg or "10053" in msg:
        print(
            f"[transactions] {step} lost the SQL connection. "
            "Try again later, preferably after :25 past the hour, or reduce the backfill window."
        )
    else:
        print(f"[transactions] {step} failed with a database error.")



def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    saved_watermark = get_watermark(WATERMARK_DB, VIEW_NAME)
    last_value, end_value, should_update_watermark = _resolve_window(saved_watermark)
    mode = "backfill" if BACKFILL_START_DATE else "incremental"
    print(f"[transactions] Mode: {mode}")
    print(f"[transactions] Current watermark: {last_value}")
    if end_value:
        print(f"[transactions] Window end: {end_value}")

    engine = build_engine()

    try:
        with engine.connect() as conn:
            # Step 1: build ID bounds from a date window.
            if end_value:
                id_range_query = text(f"""
                    SELECT
                        MIN(TransactionID) AS min_id,
                        MAX(TransactionID) AS max_id
                    FROM {VIEW_NAME}
                    WHERE {CURSOR_COLUMN} >= :last_value
                      AND {CURSOR_COLUMN} < :end_value
                """)
                range_params = {"last_value": last_value, "end_value": end_value}
            else:
                id_range_query = text(f"""
                    SELECT
                        MIN(TransactionID) AS min_id,
                        MAX(TransactionID) AS max_id
                    FROM {VIEW_NAME}
                    WHERE {CURSOR_COLUMN} >= :last_value
                """)
                range_params = {"last_value": last_value}

            print("[transactions] Querying ID bounds...")
            id_range = pd.read_sql(
                id_range_query,
                conn,
                params=range_params,
            )

            if id_range.empty:
                print("[transactions] No new data.")
                return
            min_id = id_range.loc[0, "min_id"]
            max_id = id_range.loc[0, "max_id"]
            if pd.isna(min_id) or pd.isna(max_id):
                print("[transactions] No new data.")
                return
            print(f"[transactions] ID range: {min_id} -> {max_id}")

            cols_sql = ", ".join(COLUMNS)
            # Step 2: fetch rows using TransactionID index only.
            data_query = text(f"""
                SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql}
                FROM {VIEW_NAME}
                WHERE TransactionID BETWEEN :min_id AND :max_id
                ORDER BY TransactionID
            """)
            print(f"[transactions] Fetching rows in chunks of {CHUNK_SIZE}...")
            chunks = pd.read_sql(
                data_query,
                conn,
                params={
                    "min_id": min_id,
                    "max_id": max_id,
                },
                chunksize=CHUNK_SIZE,
            )
            frames: list[pd.DataFrame] = []
            total = 0
            for chunk in chunks:
                rows = len(chunk)
                total += rows
                frames.append(chunk)
                print(f"[transactions] Pulled rows so far: {total}")
            df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

            if df.empty:
                print("[transactions] No new data.")
                return
    except DatabaseError as exc:
        _describe_db_error("Transaction extract", exc)
        raise


    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"transactions_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[transactions] Saved to {out_file}")
    new_watermark = str(df["__cursor__"].max())
    if should_update_watermark:
        set_watermark(WATERMARK_DB, VIEW_NAME, new_watermark)
        print(f"[transactions] Updated watermark to: {new_watermark}")
    else:
        print(f"[transactions] Backfill mode: watermark left unchanged (saved={saved_watermark})")


if __name__ == "__main__":
    main()
