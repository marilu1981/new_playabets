"""
incremental_transactions_simple.py
----------------------------------
Runs the DWH team's recommended transaction query style:
1) find min/max TransactionID for a date window
2) use TransactionID BETWEEN bounds for the main query

Run from the project root:
    python -m src.extract.incremental_transactions_simple
"""
from __future__ import annotations

from datetime import datetime, UTC
from pathlib import Path
from time import perf_counter

import pandas as pd
from pandas.errors import DatabaseError
from sqlalchemy import text

from src.extract.db_utils import build_engine

VIEW_NAME = "Dwh_en.view_transactions"
START_DATE = "2026-03-15"
END_DATE = "2026-03-16" # e.g. "2026-03-16"

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = PROJECT_ROOT / "data" / "raw" / "transactions"


def _log(msg: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[transactions_simple] {ts} UTC | {msg}")


def _describe_db_error(step: str, exc: Exception) -> None:
    msg = str(exc).lower()
    if "timeout" in msg or "hyt00" in msg:
        _log(f"{step} timed out. Try a narrower date window or increase DWH_QUERY_TIMEOUT_SECONDS.")
    elif "08s01" in msg or "communication link failure" in msg or "10053" in msg:
        _log(f"{step} lost the SQL connection. Try again later or reduce the date window.")
    else:
        _log(f"{step} failed with a database error.")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    _log(f"Start date: {START_DATE}")
    if END_DATE:
        _log(f"End date: {END_DATE}")

    if END_DATE:
        id_range_query = text(f"""
            SELECT
                MinID = MIN(TransactionID),
                MaxID = MAX(TransactionID)
            FROM {VIEW_NAME}
            WHERE Date >= :start_date
              AND Date < :end_date
        """)
        range_params = {"start_date": START_DATE, "end_date": END_DATE}
    else:
        id_range_query = text(f"""
            SELECT
                MinID = MIN(TransactionID),
                MaxID = MAX(TransactionID)
            FROM {VIEW_NAME}
            WHERE Date >= :start_date
        """)
        range_params = {"start_date": START_DATE}

    aggregate_query = text(f"""
        SELECT
            CAST(Date AS DATE) AS tx_date,
            SUM(CASE WHEN TransactionAmountTypeID = 1 THEN ABS(Amount) ELSE 0 END) AS total_deposits,
            SUM(CASE WHEN TransactionAmountTypeID = 2 THEN ABS(Amount) ELSE 0 END) AS total_withdrawals,
            COUNT(DISTINCT UserID) AS unique_depositors
        FROM {VIEW_NAME}
        WHERE TransactionID BETWEEN :min_id AND :max_id
        GROUP BY CAST(Date AS DATE)
        ORDER BY tx_date DESC
    """)

    count_query = text(f"""
        SELECT COUNT(*) AS row_count
        FROM {VIEW_NAME}
        WHERE TransactionID BETWEEN :min_id AND :max_id
    """)

    engine = build_engine()
    try:
        with engine.connect() as conn:
            t0 = perf_counter()
            _log("Step 1/3: Querying TransactionID bounds...")
            id_range = pd.read_sql(id_range_query, conn, params=range_params)
            _log(f"Step 1/3 complete in {perf_counter() - t0:.1f}s")

            if id_range.empty:
                _log("No ID range result returned.")
                return
            min_id = id_range.loc[0, "MinID"]
            max_id = id_range.loc[0, "MaxID"]
            if pd.isna(min_id) or pd.isna(max_id):
                _log("No data in selected window (min/max TransactionID is NULL).")
                return

            _log(f"ID range: {min_id} -> {max_id}")

            t1 = perf_counter()
            _log("Step 2/3: Counting rows in ID range...")
            count_df = pd.read_sql(count_query, conn, params={"min_id": min_id, "max_id": max_id})
            row_count = int(count_df.loc[0, "row_count"]) if not count_df.empty else 0
            _log(f"Step 2/3 complete in {perf_counter() - t1:.1f}s | rows: {row_count}")

            t2 = perf_counter()
            _log("Step 3/3: Running aggregate query...")
            df = pd.read_sql(aggregate_query, conn, params={"min_id": min_id, "max_id": max_id})
            _log(f"Step 3/3 complete in {perf_counter() - t2:.1f}s")
    except DatabaseError as exc:
        _describe_db_error("Transaction simple extract", exc)
        raise

    _log(f"Rows pulled: {len(df)}")
    if df.empty:
        _log("No data in this date window.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"transactions_simple_daily_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    _log(f"Saved to {out_file}")


if __name__ == "__main__":
    main()
