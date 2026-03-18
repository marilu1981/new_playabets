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

from pathlib import Path
from time import perf_counter

from datetime import datetime, UTC, timedelta

import pandas as pd
from pandas.errors import DatabaseError
from sqlalchemy import text

from src.extract.db_utils import build_engine

VIEW_NAME = "Dwh_en.view_transactions"
START_DATE = "2026-03-15"
END_DATE = "2026-03-16"
RUN_DAY_BY_DAY = True
WINDOW_HOURS: int | None = None


PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = PROJECT_ROOT / "data" / "raw" / "transactions"

def _parse_date(value: str) -> datetime:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unsupported date format: {value}")


def _windows() -> list[tuple[str, str | None]]:
    if not END_DATE:
        return [(START_DATE, None)]
    if WINDOW_HOURS and WINDOW_HOURS > 0:
        start = _parse_date(START_DATE)
        end = _parse_date(END_DATE)
        windows: list[tuple[str, str | None]] = []
        current = start
        while current < end:
            nxt = min(current + timedelta(hours=WINDOW_HOURS), end)
            windows.append(
                (
                    current.strftime("%Y-%m-%d %H:%M:%S"),
                    nxt.strftime("%Y-%m-%d %H:%M:%S"),
                )
            )
            current = nxt
        return windows
    if not RUN_DAY_BY_DAY:
        return [(START_DATE, END_DATE)]

    start = _parse_date(START_DATE)
    end = _parse_date(END_DATE)
    windows: list[tuple[str, str | None]] = []
    current = start
    while current < end:
        nxt = current + timedelta(days=1)
        windows.append((current.strftime("%Y-%m-%d"), nxt.strftime("%Y-%m-%d")))
        current = nxt
    return windows



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
    if WINDOW_HOURS and END_DATE:
        _log(f"Hour window mode: {WINDOW_HOURS}h")
    if RUN_DAY_BY_DAY and END_DATE:
        _log("Day-by-day mode: enabled")

    engine = build_engine()
    frames: list[pd.DataFrame] = []
    try:
        with engine.connect() as conn:
            t0 = perf_counter()

            for idx, (window_start, window_end) in enumerate(_windows(), start=1):
                if window_end:
                    _log(f"Window {idx}: {window_start} -> {window_end}")
                    aggregate_query = text(f"""
                        WITH IdRange AS (
                            SELECT
                                MinID = MIN(TransactionID),
                                MaxID = MAX(TransactionID)
                            FROM {VIEW_NAME}
                            WHERE Date >= :start_date
                              AND Date < :end_date
                        )
                        SELECT
                            CAST(Date AS DATE) AS tx_date,
                            SUM(CASE WHEN TransactionAmountTypeID = 1 THEN ABS(Amount) ELSE 0 END) AS total_deposits,
                            SUM(CASE WHEN TransactionAmountTypeID = 2 THEN ABS(Amount) ELSE 0 END) AS total_withdrawals,
                            COUNT(DISTINCT UserID) AS unique_depositors
                        FROM {VIEW_NAME}
                        CROSS JOIN IdRange
                        WHERE TransactionID BETWEEN IdRange.MinID AND IdRange.MaxID
                        GROUP BY CAST(Date AS DATE)
                        ORDER BY tx_date DESC
                    """)
                    params = {"start_date": window_start, "end_date": window_end}
                else:
                    _log(f"Window {idx}: {window_start}+")
                    aggregate_query = text(f"""
                        WITH IdRange AS (
                            SELECT
                                MinID = MIN(TransactionID),
                                MaxID = MAX(TransactionID)
                            FROM {VIEW_NAME}
                            WHERE Date >= :start_date
                        )
                        SELECT
                            CAST(Date AS DATE) AS tx_date,
                            SUM(CASE WHEN TransactionAmountTypeID = 1 THEN ABS(Amount) ELSE 0 END) AS total_deposits,
                            SUM(CASE WHEN TransactionAmountTypeID = 2 THEN ABS(Amount) ELSE 0 END) AS total_withdrawals,
                            COUNT(DISTINCT UserID) AS unique_depositors
                        FROM {VIEW_NAME}
                        CROSS JOIN IdRange
                        WHERE TransactionID BETWEEN IdRange.MinID AND IdRange.MaxID
                        GROUP BY CAST(Date AS DATE)
                        ORDER BY tx_date DESC
                    """)
                    params = {"start_date": window_start}
                t0 = perf_counter()
                _log("Running aggregate CTE query...")
                window_df = pd.read_sql(aggregate_query, conn, params=params)
                _log(f"Window {idx} complete in {perf_counter() - t0:.1f}s | rows: {len(window_df)}")
                if not window_df.empty:
                    frames.append(window_df)

    except DatabaseError as exc:
        _describe_db_error("Transaction simple extract", exc)
        raise

    if not frames:
        _log("No data in this date window.")
        return

    df = pd.concat(frames, ignore_index=True)
    df = (
        df.groupby("tx_date", as_index=False)
        .agg(
            total_deposits=("total_deposits", "sum"),
            total_withdrawals=("total_withdrawals", "sum"),
            unique_depositors=("unique_depositors", "max"),
        )
        .sort_values("tx_date", ascending=False)
    )

    _log(f"Rows pulled: {len(df)}")

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")

    out_file = OUT_DIR / f"transactions_simple_daily_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    _log(f"Saved to {out_file}")


if __name__ == "__main__":
    main()
