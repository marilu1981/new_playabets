"""
incremental_transactions_simple.py
----------------------------------
Pulls daily transaction aggregates from Dwh_en.view_transactions and writes
pre-aggregated Parquet files to data/raw/transactions/.

Why pre-aggregate in SQL (not pull raw rows):
  view_transactions has ~4M rows/day. Pulling raw rows would never complete.
  Instead we run two fast inlined-date queries (~83s deposits, ~41s withdrawals)
  and write the daily summary directly.

Timezone handling — SAST (UTC+2):
  The DWH stores timestamps in UTC.  Dashboard dates are SAST calendar days.
  SAST midnight for date D = UTC 22:00 on D-1.
  So for SAST date "2026-04-08" the SQL window is:
      Date >= '2026-04-07 22:00:00' AND Date < '2026-04-08 22:00:00'
  START_DATE / END_DATE are SAST calendar dates; UTC conversion is done internally.

Output file pattern:
  data/raw/transactions/transactions_daily_agg_{SAST_date}.parquet
  Columns: date, deposits, withdrawals, net_deposits, unique_depositors,
           deposit_count, withdrawal_count, tx_count

build_domain_kpis.py detects these _agg_ files and uses them directly,
bypassing transactions_kpi.py (which expects raw row-level data).

DWH team guidance:
  - Inline dates as string literals in WHERE — parameterised placeholders timeout.
  - Run after :20 past the hour so DWH ETL has finished loading.

Run from the project root:
    python -m src.extract.incremental_transactions_simple

Optional env overrides:
    START_DATE   SAST date e.g. "2026-04-08"  (default: yesterday SAST)
    END_DATE     SAST date e.g. "2026-04-09"  (default: today SAST, gives full yesterday)
    WAIT_FOR_20  set to "0" to skip the :20 guard (default: "1")
"""
from __future__ import annotations

import os
import time
from time import perf_counter
from datetime import datetime, UTC, timedelta, date

import pandas as pd
from pandas.errors import DatabaseError
from sqlalchemy import text

from src.extract.db_utils import build_engine
from src.app_config import RAW_ROOT

VIEW_NAME = "Dwh_en.view_transactions"

_yesterday = (date.today() - timedelta(days=1)).isoformat()
_today     = date.today().isoformat()

START_DATE  = os.environ.get("START_DATE", _yesterday)   # inclusive
END_DATE    = os.environ.get("END_DATE",   _today)        # exclusive upper bound
WAIT_FOR_20 = os.environ.get("WAIT_FOR_20", "1") == "1"

OUT_DIR = RAW_ROOT / "transactions"


def _log(msg: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[transactions] {ts} UTC | {msg}")


def _wait_until_20_past() -> None:
    """Block until :20 past the hour. DWH ETL loads on the hour."""
    now = datetime.now(UTC)
    if now.minute >= 20:
        return
    target = now.replace(minute=20, second=0, microsecond=0)
    wait_s = (target - now).total_seconds()
    _log(f"Waiting {wait_s:.0f}s until :20 past the hour (DWH ETL guard)...")
    time.sleep(wait_s)
    _log("Resuming.")


def _safe_date(val: str) -> str:
    """Ensure only safe characters before inlining into SQL."""
    if not all(c in "0123456789-: " for c in val):
        raise ValueError(f"Unsafe date value: {val!r}")
    return val


def _sast_day_utc_window(sast_date: str) -> tuple[str, str]:
    """
    Convert a SAST calendar date string to UTC query boundaries.
    SAST midnight = UTC 22:00 the previous day.

    e.g. "2026-04-08"  →  ("2026-04-07 22:00:00", "2026-04-08 22:00:00")
    """
    from datetime import date as _date
    d = _date.fromisoformat(sast_date)
    utc_start = str(d - timedelta(days=1)) + " 22:00:00"
    utc_end   = str(d) + " 22:00:00"
    return _safe_date(utc_start), _safe_date(utc_end)


# 873=FnbEWallet Deposit and 875=InstantMoney Deposit are excluded from deposits
# as they are offset transactions that belong in the withdrawals bucket.
DEPOSIT_REASON_IDS = (
    "248,249,250,830,835,839,843,851,853,855,857,859,"
    "861,863,865,867,869,871,877,939"
)

# Actual withdrawals (positive amounts).
WITHDRAWAL_REASON_IDS = "251,252,253,254,831,833,837,841,845,847,849,873,875"

# Cancel withdrawals are stored as positive values in the DB but represent
# reversed/cancelled withdrawals — subtract them from the withdrawal total.
CANCEL_WITHDRAWAL_REASON_IDS = "838,842,846,848,850"


def _query_deposits(conn, sast_date: str) -> pd.DataFrame:
    s, e = _sast_day_utc_window(sast_date)
    q = text(f"""
        SELECT
            SUM(ABS(Amount))        AS deposits,
            COUNT(DISTINCT UserID)  AS unique_depositors,
            COUNT(*)                AS deposit_count
        FROM {VIEW_NAME}
        WHERE Date >= '{s}'
          AND Date <  '{e}'
          AND TransactionAmountTypeID = 1
          AND TransactionManagementStatusID = 3
          AND ReasonID IN ({DEPOSIT_REASON_IDS})
    """)
    t0 = perf_counter()
    _log(f"Querying deposits: {s} → {e}  (SAST {sast_date})")
    df = pd.read_sql(q, conn)
    _log(f"Deposits done in {perf_counter()-t0:.1f}s | rows: {len(df)}")
    return df


def _query_withdrawals(conn, sast_date: str) -> pd.DataFrame:
    s, e = _sast_day_utc_window(sast_date)
    # Net withdrawals = actual withdrawals - cancel withdrawals.
    # Cancel withdrawal ReasonIDs are stored as positive in the DB so we subtract them.
    q = text(f"""
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
    _log(f"Querying withdrawals: {s} → {e}  (SAST {sast_date})")
    df = pd.read_sql(q, conn)
    _log(f"Withdrawals done in {perf_counter()-t0:.1f}s | rows: {len(df)}")
    return df


def _merge(sast_date: str, deposits: pd.DataFrame, withdrawals: pd.DataFrame) -> pd.DataFrame:
    dep = float(deposits["deposits"].iloc[0])          if not deposits.empty else 0.0
    uniq = int(deposits["unique_depositors"].iloc[0])  if not deposits.empty else 0
    dep_cnt = int(deposits["deposit_count"].iloc[0])   if not deposits.empty else 0
    wd  = float(withdrawals["withdrawals"].iloc[0])    if not withdrawals.empty else 0.0
    wd_cnt = int(withdrawals["withdrawal_count"].iloc[0]) if not withdrawals.empty else 0

    from datetime import date as _date
    df = pd.DataFrame([{
        "date":               _date.fromisoformat(sast_date),
        "deposits":           dep,
        "unique_depositors":  uniq,
        "deposit_count":      dep_cnt,
        "withdrawals":        wd,
        "withdrawal_count":   wd_cnt,
        "net_deposits":       dep - wd,
        "tx_count":           dep_cnt + wd_cnt,
    }])
    return df


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    utc_s, utc_e = _sast_day_utc_window(START_DATE)
    _log(f"SAST date: {START_DATE}  →  UTC window: {utc_s} to {utc_e}")

    if WAIT_FOR_20:
        _wait_until_20_past()

    engine = build_engine()
    try:
        with engine.connect() as conn:
            deposits    = _query_deposits(conn, START_DATE)
            withdrawals = _query_withdrawals(conn, START_DATE)
    except DatabaseError as exc:
        msg = str(exc).lower()
        if "timeout" in msg or "hyt00" in msg:
            _log("Query timed out. Try increasing DWH_QUERY_TIMEOUT_SECONDS.")
        else:
            _log(f"Database error: {exc}")
        raise

    dep_val = float(deposits["deposits"].iloc[0]) if not deposits.empty else 0.0
    wd_val  = float(withdrawals["withdrawals"].iloc[0]) if not withdrawals.empty else 0.0
    if dep_val == 0 and wd_val == 0:
        _log("No data returned for this date window.")
        return

    df = _merge(START_DATE, deposits, withdrawals)
    _log(f"Rows: {len(df)}")
    _log("\n" + df.to_string(index=False))

    # Named by SAST date for easy deduplication by build_domain_kpis.py
    out_file = OUT_DIR / f"transactions_daily_agg_{START_DATE}.parquet"
    df.to_parquet(out_file, index=False)
    _log(f"Saved → {out_file}")


if __name__ == "__main__":
    main()
