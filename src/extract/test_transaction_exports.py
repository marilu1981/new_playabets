"""
test_transaction_exports.py
---------------------------
Systematically tests which query strategies work against view_transactions
given the unoptimised AWS DWH table.  Each strategy is attempted independently
with its own timeout so one failure does not block the others.

Run from project root:
    python -m src.extract.test_transaction_exports

Optional env overrides:
    TEST_DATE        – single date to probe, e.g. "2026-03-20"  (default: yesterday)
    TEST_START       – explicit start datetime for range tests
    TEST_END         – explicit end datetime for range tests
    TEST_TIMEOUT     – per-query timeout in seconds (default: 120)
    TEST_TOP_N       – row limit for the sample query (default: 200)
    TEST_SAVE_CSV    – set to "1" to save successful results as CSV (default: 1)

Results are printed to console with timing, and saved to
    data/raw/transactions/test_exports_<timestamp>/
"""
from __future__ import annotations

import os
import csv
import sys
import traceback
from datetime import datetime, timedelta, UTC
from pathlib import Path
from time import perf_counter
from typing import Any

import pandas as pd
import pyodbc
from sqlalchemy import text

# ── project imports ────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.extract.db_utils import build_engine

# ── config ─────────────────────────────────────────────────────────────────────
VIEW  = "Dwh_en.view_transactions"
TODAY = datetime.now(UTC).date()
YESTERDAY = TODAY - timedelta(days=1)

TEST_DATE    = os.environ.get("TEST_DATE",    str(YESTERDAY))
TEST_START   = os.environ.get("TEST_START",   f"{TEST_DATE} 00:00:00")
TEST_END     = os.environ.get("TEST_END",     f"{TEST_DATE} 23:59:59")
TEST_TIMEOUT = int(os.environ.get("TEST_TIMEOUT", "120"))      # seconds per query
TEST_TOP_N   = int(os.environ.get("TEST_TOP_N",   "200"))
SAVE_CSV     = os.environ.get("TEST_SAVE_CSV", "1") == "1"

TS = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "raw" / "transactions" / f"test_exports_{TS}"
OUT_DIR.mkdir(parents=True, exist_ok=True)

RESULTS: list[dict[str, Any]] = []


# ── helpers ────────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(UTC).strftime("%H:%M:%S")


def _log(strategy: str, msg: str) -> None:
    print(f"  [{_now()}] {strategy}: {msg}")


def _record(strategy: str, status: str, elapsed: float,
            rows: int | None = None, note: str = "") -> None:
    icon = "✓" if status == "OK" else "✗" if status == "FAIL" else "⏱"
    summary = f"{icon}  {strategy:<45} {status:<8} {elapsed:>7.1f}s"
    if rows is not None:
        summary += f"  {rows} row(s)"
    if note:
        summary += f"  [{note}]"
    print(summary)
    RESULTS.append({
        "strategy": strategy,
        "status": status,
        "elapsed_s": round(elapsed, 2),
        "rows": rows,
        "note": note,
    })


def _run(strategy: str, engine, query: str, params: dict | None = None) -> pd.DataFrame | None:
    """Execute a single strategy. Returns DataFrame on success, None on failure."""
    print(f"\n{'─'*70}")
    print(f"  Strategy: {strategy}")
    print(f"  Query preview: {query.strip()[:200].replace(chr(10), ' ')}")
    t0 = perf_counter()
    try:
        with engine.connect() as conn:
            df = pd.read_sql(text(query), conn, params=params or {})
        elapsed = perf_counter() - t0
        _record(strategy, "OK", elapsed, len(df))
        if not df.empty:
            print(df.to_string(index=False, max_rows=10))
        else:
            _log(strategy, "Query succeeded but returned 0 rows.")
        if SAVE_CSV and not df.empty:
            fname = OUT_DIR / f"{strategy.replace(' ', '_').replace('/', '_')}.csv"
            df.to_csv(fname, index=False)
            _log(strategy, f"Saved → {fname.name}")
        return df
    except Exception as exc:
        elapsed = perf_counter() - t0
        msg = str(exc)
        if "timeout" in msg.lower() or "hyt00" in msg.lower():
            _record(strategy, "TIMEOUT", elapsed, note=msg[:120])
        elif "08s01" in msg or "10053" in msg or "communication" in msg.lower():
            _record(strategy, "CONN_ERR", elapsed, note=msg[:120])
        else:
            _record(strategy, "FAIL", elapsed, note=msg[:120])
        return None


# ── strategy definitions ───────────────────────────────────────────────────────

def run_all() -> None:
    print(f"\n{'='*70}")
    print(f"  Playabets Transaction Export Probe")
    print(f"  View:       {VIEW}")
    print(f"  Test date:  {TEST_DATE}  ({TEST_START} → {TEST_END})")
    print(f"  Timeout:    {TEST_TIMEOUT}s per query")
    print(f"  Output dir: {OUT_DIR}")
    print(f"{'='*70}\n")

    engine = build_engine()

    # ── 3. CTE with INLINED dates (DWH team's recommended approach) ──────────────
    # Parameterised dates (:s, :e) consistently timeout — the optimizer cannot
    # see the literal values and falls back to a full table scan.
    # Inlining the dates as string literals allows the optimizer to use the index.
    _run(
        "3. CTE inlined dates — COUNT (step 1 only)",
        engine,
        f"""
        SELECT COUNT(*) AS row_count
        FROM {VIEW}
        WHERE Date >= '{TEST_START}'
          AND Date <  '{TEST_END}'
        """,
    )

    # ── 4. CTE inlined dates — full aggregate (DWH team's exact approach) ────────
    _run(
        "4. CTE inlined dates — full daily aggregate",
        engine,
        f"""
        WITH IdRange AS (
            SELECT
                MIN(TransactionID) AS MinID,
                MAX(TransactionID) AS MaxID
            FROM {VIEW}
            WHERE Date >= '{TEST_START}'
              AND Date <  '{TEST_END}'
        )
        SELECT
            CAST(t.Date AS DATE)                                                      AS date,
            SUM(CASE WHEN t.TransactionAmountTypeID = 1 THEN ABS(t.Amount) ELSE 0 END) AS deposits,
            SUM(CASE WHEN t.TransactionAmountTypeID = 2 THEN ABS(t.Amount) ELSE 0 END) AS withdrawals,
            COUNT(DISTINCT t.UserID)                                                   AS unique_depositors
        FROM {VIEW} t
        CROSS JOIN IdRange
        WHERE t.TransactionID BETWEEN IdRange.MinID AND IdRange.MaxID
        GROUP BY CAST(t.Date AS DATE)
        ORDER BY date
        """,
    )

    # ── 5. Inlined Date — deposits only (simpler, faster scan) ───────────────────
    _run(
        "5. Inlined Date — deposits only aggregate",
        engine,
        f"""
        SELECT
            CAST(Date AS DATE)      AS date,
            SUM(ABS(Amount))        AS deposits,
            COUNT(DISTINCT UserID)  AS unique_depositors
        FROM {VIEW}
        WHERE Date >= '{TEST_START}'
          AND Date <  '{TEST_END}'
          AND TransactionAmountTypeID = 1
        GROUP BY CAST(Date AS DATE)
        """,
    )

    # ── 6. Inlined Date — withdrawals only ───────────────────────────────────────
    _run(
        "6. Inlined Date — withdrawals only aggregate",
        engine,
        f"""
        SELECT
            CAST(Date AS DATE)  AS date,
            SUM(ABS(Amount))    AS withdrawals
        FROM {VIEW}
        WHERE Date >= '{TEST_START}'
          AND Date <  '{TEST_END}'
          AND TransactionAmountTypeID = 2
        GROUP BY CAST(Date AS DATE)
        """,
    )

    # ── 9. INFORMATION_SCHEMA — what other transaction objects exist? ──────────
    # (Cheap metadata query — always fast)
    _run(
        "9. List DWH objects with 'transaction' in name",
        engine,
        """
        SELECT
            TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME LIKE '%transaction%'
           OR TABLE_NAME LIKE '%Transaction%'
        ORDER BY TABLE_TYPE, TABLE_NAME
        """,
    )

    # ── 10. Probe for pre-aggregated daily/summary views ──────────────────────
    for candidate in [
        "Dwh_en.view_transactions_daily",
        "Dwh_en.view_TransactionSummary",
        "Dwh_en.view_DailyTransactions",
        "dbo.view_transactions_daily",
        "Dwh_en.view_deposits",
        "Dwh_en.view_withdrawals",
    ]:
        _run(
            f"10. Probe alternate view: {candidate}",
            engine,
            f"SELECT TOP 5 * FROM {candidate}",
        )

    # ── Summary ────────────────────────────────────────────────────────────────
    _print_summary()


def _print_summary() -> None:
    print(f"\n{'='*70}")
    print(f"  SUMMARY  ({_now()} UTC)")
    print(f"{'='*70}")
    print(f"  {'Strategy':<45} {'Status':<10} {'Time':>8}  Rows")
    print(f"  {'-'*45} {'-'*10} {'-'*8}  ----")
    for r in RESULTS:
        rows_str = str(r["rows"]) if r["rows"] is not None else "—"
        print(f"  {r['strategy']:<45} {r['status']:<10} {r['elapsed_s']:>7.1f}s  {rows_str}")
        if r["note"]:
            print(f"    ↳ {r['note'][:100]}")

    ok = [r for r in RESULTS if r["status"] == "OK"]
    failed = [r for r in RESULTS if r["status"] != "OK"]
    print(f"\n  ✓ Passed: {len(ok)}   ✗ Failed/Timeout: {len(failed)}")

    if SAVE_CSV:
        summary_path = OUT_DIR / "_summary.csv"
        with open(summary_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["strategy", "status", "elapsed_s", "rows", "note"])
            writer.writeheader()
            writer.writerows(RESULTS)
        print(f"\n  Summary saved → {summary_path}")

    print(f"\n  Next steps:")
    if ok:
        names = [r["strategy"] for r in ok]
        print(f"  • Build incremental pipeline using: {names}")
        print(f"  • Results saved to: {OUT_DIR}")
    else:
        print("  • All strategies failed — check VPN/DWH connection and timeout settings.")
        print(f"  • Try: SET TEST_TIMEOUT=300 and re-run with a narrower TEST_DATE window.")
    print()


if __name__ == "__main__":
    run_all()
