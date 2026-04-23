"""
backfill_transactions.py
------------------------
Pulls daily transaction aggregates for a historical date range, one day at a
time.  Each day is saved as a separate Parquet file so:
  - Progress is preserved — re-runs skip already-completed days.
  - Individual failed days can be retried without re-doing everything.
  - build_domain_kpis.py picks up all files automatically.

Run from the project root:
    python -m src.extract.backfill_transactions

Required env vars (same as incremental_transactions_simple):
    DWH_SERVER, DWH_USER, DWH_PASS

Optional env overrides:
    BACKFILL_START   e.g. "2026-01-01"  (default: 90 days ago)
    BACKFILL_END     e.g. "2026-04-08"  (default: yesterday, inclusive)
    DELAY_SECONDS    pause between days — be kind to the DWH (default: 10)
    WAIT_FOR_20      set to "0" to skip the :20 guard (default: "1")
"""
from __future__ import annotations

import os
import time
from time import perf_counter
from datetime import datetime, UTC, timedelta, date

import pandas as pd
from sqlalchemy import text

from src.extract.db_utils import build_engine
from src.app_config import RAW_ROOT

VIEW_NAME   = "Dwh_en.view_transactions"
OUT_DIR     = RAW_ROOT / "transactions"

_yesterday  = date.today() - timedelta(days=1)
_90_days_ago = date.today() - timedelta(days=90)

BACKFILL_START = date.fromisoformat(os.environ.get("BACKFILL_START", str(_90_days_ago)))
BACKFILL_END   = date.fromisoformat(os.environ.get("BACKFILL_END",   str(_yesterday)))
DELAY_SECONDS  = int(os.environ.get("DELAY_SECONDS", "10"))
WAIT_FOR_20    = os.environ.get("WAIT_FOR_20", "1") == "1"


def _log(msg: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[backfill] {ts} UTC | {msg}")


def _wait_until_20_past() -> None:
    now = datetime.now(UTC)
    if now.minute >= 20:
        return
    target = now.replace(minute=20, second=0, microsecond=0)
    wait_s = (target - now).total_seconds()
    _log(f"Waiting {wait_s:.0f}s until :20 past the hour (DWH ETL guard)...")
    time.sleep(wait_s)
    _log("Resuming.")


def _safe(val: str) -> str:
    if not all(c in "0123456789-: " for c in val):
        raise ValueError(f"Unsafe date value: {val!r}")
    return val


def _fetch_day(conn, day: date) -> pd.DataFrame:
    # SAST = UTC+2.  SAST midnight for calendar date `day` is 22:00 UTC the
    # *previous* day, so the correct window is:
    #   Date >= '{day-1} 22:00:00'  AND  Date < '{day} 22:00:00'
    s = _safe(str(day - timedelta(days=1)) + " 22:00:00")
    e = _safe(str(day) + " 22:00:00")

    DEPOSIT_REASON_IDS = (
        "248,249,250,830,835,839,843,851,853,855,857,859,"
        "861,863,865,867,869,871,877,939"
    )
    WITHDRAWAL_REASON_IDS = "251,252,253,254,831,833,837,841,845,847,849,873,875"
    CANCEL_WITHDRAWAL_REASON_IDS = "838,842,846,848,850"

    dep_q = text(f"""
        SELECT
            SUM(Amount)             AS deposits,
            COUNT(DISTINCT UserID)  AS unique_depositors,
            COUNT(*)                AS deposit_count
        FROM {VIEW_NAME}
        WHERE Date >= '{s}'
          AND Date <  '{e}'
          AND TransactionAmountTypeID = 1
          AND TransactionManagementStatusID = 3
          AND ReasonID IN ({DEPOSIT_REASON_IDS})
    """)
    wd_q = text(f"""
        SELECT
            SUM(CASE
                WHEN ReasonID IN ({CANCEL_WITHDRAWAL_REASON_IDS}) THEN -ABS(Amount)
                ELSE ABS(Amount)
            END)            AS withdrawals,
            COUNT(*)        AS withdrawal_count
        FROM {VIEW_NAME}
        WHERE Date >= '{s}'
          AND Date <  '{e}'
          AND TransactionManagementStatusID = 3
          AND ReasonID IN ({WITHDRAWAL_REASON_IDS},{CANCEL_WITHDRAWAL_REASON_IDS})
    """)

    t0 = perf_counter()
    dep = pd.read_sql(dep_q, conn)
    _log(f"  deposits done in {perf_counter()-t0:.1f}s")

    t1 = perf_counter()
    wd  = pd.read_sql(wd_q, conn)
    _log(f"  withdrawals done in {perf_counter()-t1:.1f}s")

    # Each query returns a single aggregate row (no GROUP BY) for the day window.
    deposits     = float(dep["deposits"].iloc[0])     if not dep.empty else 0.0
    unique_dep   = int(dep["unique_depositors"].iloc[0]) if not dep.empty else 0
    dep_count    = int(dep["deposit_count"].iloc[0])  if not dep.empty else 0
    withdrawals  = float(wd["withdrawals"].iloc[0])   if not wd.empty else 0.0
    wd_count     = int(wd["withdrawal_count"].iloc[0]) if not wd.empty else 0

    if deposits == 0 and withdrawals == 0:
        return pd.DataFrame()

    df = pd.DataFrame([{
        "date":               day,
        "deposits":           deposits,
        "unique_depositors":  unique_dep,
        "deposit_count":      dep_count,
        "withdrawals":        withdrawals,
        "withdrawal_count":   wd_count,
        "net_deposits":       deposits - withdrawals,
        "tx_count":           dep_count + wd_count,
    }])
    return df


def _date_range(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    all_days  = list(_date_range(BACKFILL_START, BACKFILL_END))
    total     = len(all_days)

    # Work out which days already have a file.
    done      = {f.stem.replace("transactions_daily_agg_", "") for f in OUT_DIR.glob("transactions_daily_agg_*.parquet")}
    remaining = [d for d in all_days if str(d) not in done]

    _log(f"Backfill range: {BACKFILL_START} → {BACKFILL_END}  ({total} days)")
    _log(f"Already done:   {len(done)} days")
    _log(f"To fetch:       {len(remaining)} days")

    if not remaining:
        _log("Nothing to do — all days already fetched.")
        return

    if WAIT_FOR_20:
        _wait_until_20_past()

    engine  = build_engine()
    success = 0
    failed  = []

    for idx, day in enumerate(remaining, start=1):
        _log(f"[{idx}/{len(remaining)}] Fetching {day}...")
        t0 = perf_counter()
        try:
            with engine.connect() as conn:
                df = _fetch_day(conn, day)
            if df.empty:
                _log(f"  No data for {day} — skipping.")
            else:
                out = OUT_DIR / f"transactions_daily_agg_{day}.parquet"
                df.to_parquet(out, index=False)
                elapsed = perf_counter() - t0
                _log(f"  Saved {day}: deposits={df['deposits'].sum():,.0f}  withdrawals={df['withdrawals'].sum():,.0f}  ({elapsed:.0f}s)")
                success += 1
        except Exception as exc:
            _log(f"  FAILED {day}: {exc}")
            failed.append((day, str(exc)))
            # TCP drop leaves the pool in a broken state — rebuild the engine so
            # the next day starts with a clean connection.
            try:
                engine.dispose()
            except Exception:
                pass
            engine = build_engine()

        if idx < len(remaining) and DELAY_SECONDS > 0:
            time.sleep(DELAY_SECONDS)

    _log(f"\nDone. {success} days saved, {len(failed)} failed.")
    if failed:
        _log("Failed days (re-run to retry):")
        for d, err in failed:
            _log(f"  {d}: {err[:100]}")


if __name__ == "__main__":
    main()
