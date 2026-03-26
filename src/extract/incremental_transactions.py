"""
incremental_transactions.py
----------------------------
Pulls daily-aggregated transaction KPIs directly from
Dwh_en.view_transactions using the DWH team's recommended two-step
pattern (date window -> TransactionID bounds -> aggregate by ID range).

Output columns match what the dashboard expects:
  date, deposits, withdrawals, net_deposits, tx_count, unique_depositors,
  tx_count_accepted, tx_count_pending, tx_count_system, tx_count_other_status

Run from the project root:
    python -m src.extract.incremental_transactions

Environment variables:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password

    Optional overrides:
    TX_BACKFILL_START_DATE  – explicit start date (e.g. "2026-03-20")
    TX_BACKFILL_END_DATE    – explicit end date
    TX_BACKFILL_UPDATE_WATERMARK=1  – advance watermark after backfill
    TX_WINDOW_DAYS          – days per window (default: 1)
"""
from __future__ import annotations

import os
import pandas as pd
from datetime import datetime, timedelta, UTC
from sqlalchemy import text
from pandas.errors import DatabaseError

from src.app_config import TX_WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME     = "Dwh_en.view_transactions"
CURSOR_COLUMN = "Date"

WATERMARK_DB = TX_WATERMARK_DB_PATH
OUT_DIR = raw_dir("transactions")

# Optional backfill controls. Leave unset for normal incremental mode.
BACKFILL_START_DATE = os.environ.get("TX_BACKFILL_START_DATE")
BACKFILL_END_DATE = os.environ.get("TX_BACKFILL_END_DATE")
BACKFILL_UPDATE_WATERMARK = os.environ.get("TX_BACKFILL_UPDATE_WATERMARK", "0") == "1"
WINDOW_DAYS = int(os.environ.get("TX_WINDOW_DAYS", "1"))


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


def _generate_windows(start: str, end: str | None) -> list[tuple[str, str]]:
    """Split the range into windows of WINDOW_DAYS size."""
    start_dt = datetime.fromisoformat(start.replace(" ", "T"))
    if end:
        end_dt = datetime.fromisoformat(end.replace(" ", "T"))
    else:
        end_dt = datetime.now(UTC).replace(tzinfo=None)

    windows: list[tuple[str, str]] = []
    current = start_dt
    while current < end_dt:
        window_end = min(current + timedelta(days=WINDOW_DAYS), end_dt)
        windows.append((
            current.strftime("%Y-%m-%d %H:%M:%S"),
            window_end.strftime("%Y-%m-%d %H:%M:%S"),
        ))
        current = window_end
    return windows


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    saved_watermark = get_watermark(WATERMARK_DB, VIEW_NAME)
    last_value, end_value, should_update_watermark = _resolve_window(saved_watermark)
    mode = "backfill" if BACKFILL_START_DATE else "incremental"
    print(f"[transactions] Mode: {mode}")
    print(f"[transactions] Current watermark: {last_value}")
    if end_value:
        print(f"[transactions] Window end: {end_value}")

    windows = _generate_windows(last_value, end_value)
    if not windows:
        print("[transactions] No date windows to process.")
        return
    print(f"[transactions] Processing {len(windows)} window(s) of {WINDOW_DAYS} day(s) each")

    engine = build_engine()
    all_frames: list[pd.DataFrame] = []

    for i, (win_start, win_end) in enumerate(windows, 1):
        print(f"\n[transactions] Window {i}/{len(windows)}: {win_start} -> {win_end}")

        try:
            with engine.connect() as conn:
                # Step 1: find TransactionID bounds for this date window.
                id_range_query = text(f"""
                    SELECT
                        MIN(TransactionID) AS min_id,
                        MAX(TransactionID) AS max_id
                    FROM {VIEW_NAME}
                    WHERE {CURSOR_COLUMN} >= :win_start
                      AND {CURSOR_COLUMN} < :win_end
                """)
                id_range = pd.read_sql(
                    id_range_query, conn,
                    params={"win_start": win_start, "win_end": win_end},
                )

                if id_range.empty:
                    print(f"[transactions] Window {i}: no data.")
                    continue
                min_id = id_range.loc[0, "min_id"]
                max_id = id_range.loc[0, "max_id"]
                if pd.isna(min_id) or pd.isna(max_id):
                    print(f"[transactions] Window {i}: no data.")
                    continue
                print(f"[transactions] Window {i} ID range: {min_id} -> {max_id}")

                # Step 2: aggregate directly in SQL using the ID range.
                agg_query = text(f"""
                    SELECT
                        CAST(Date AS DATE) AS date,
                        SUM(CASE WHEN TransactionAmountTypeID = 1
                            THEN ABS(Amount) ELSE 0 END)              AS deposits,
                        SUM(CASE WHEN TransactionAmountTypeID = 2
                            THEN ABS(Amount) ELSE 0 END)              AS withdrawals,
                        COUNT(DISTINCT TransactionID)                  AS tx_count,
                        COUNT(DISTINCT CASE WHEN TransactionAmountTypeID = 1
                            THEN UserID END)                           AS unique_depositors,
                        COUNT(DISTINCT CASE
                            WHEN TransactionManagementStatus LIKE '%accept%'
                            THEN TransactionID END)                    AS tx_count_accepted,
                        COUNT(DISTINCT CASE
                            WHEN TransactionManagementStatus LIKE '%pending%'
                            THEN TransactionID END)                    AS tx_count_pending,
                        COUNT(DISTINCT CASE
                            WHEN TransactionManagementStatus LIKE '%system%'
                            THEN TransactionID END)                    AS tx_count_system
                    FROM {VIEW_NAME}
                    WHERE TransactionID BETWEEN :min_id AND :max_id
                    GROUP BY CAST(Date AS DATE)
                    ORDER BY date DESC
                """)
                print(f"[transactions] Running aggregate query...")
                window_df = pd.read_sql(
                    agg_query, conn,
                    params={"min_id": min_id, "max_id": max_id},
                )
                print(f"[transactions] Window {i}: {len(window_df)} day(s) of data")
                if not window_df.empty:
                    all_frames.append(window_df)

        except DatabaseError as exc:
            _describe_db_error(f"Window {i} ({win_start} -> {win_end})", exc)
            raise

    if not all_frames:
        print("[transactions] No new data across all windows.")
        return

    df = pd.concat(all_frames, ignore_index=True)

    # Compute derived columns the dashboard expects.
    df["net_deposits"] = df["deposits"] - df["withdrawals"]
    df["tx_count_other_status"] = (
        df["tx_count"] - df["tx_count_accepted"]
        - df["tx_count_pending"] - df["tx_count_system"]
    ).clip(lower=0)

    # If multiple windows overlap on the same date, combine them.
    df = (
        df.groupby("date", as_index=False)
        .agg(
            deposits=("deposits", "sum"),
            withdrawals=("withdrawals", "sum"),
            net_deposits=("net_deposits", "sum"),
            tx_count=("tx_count", "sum"),
            unique_depositors=("unique_depositors", "max"),
            tx_count_accepted=("tx_count_accepted", "sum"),
            tx_count_pending=("tx_count_pending", "sum"),
            tx_count_system=("tx_count_system", "sum"),
            tx_count_other_status=("tx_count_other_status", "sum"),
        )
        .sort_values("date", ascending=False)
    )

    print(f"\n[transactions] Result:\n{df.to_string(index=False)}")

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"transactions_daily_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[transactions] Saved to {out_file}")

    new_watermark = str(df["date"].max())
    if should_update_watermark:
        set_watermark(WATERMARK_DB, VIEW_NAME, new_watermark)
        print(f"[transactions] Updated watermark to: {new_watermark}")
    else:
        print(f"[transactions] Backfill mode: watermark left unchanged (saved={saved_watermark})")


if __name__ == "__main__":
    main()
