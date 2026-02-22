"""
run_small_extracts.py
----------------------
Convenience script to run the smallest/fastest extracts first so you can
get real data into the dashboard quickly.

Run order (smallest → largest):
  1. Commissions   — 4 full-refresh views, typically hundreds of rows
  2. Bonus         — Campaigns + Freebets (full-refresh) + BonusBonuses (incremental)
  3. Users         — incremental via DateVersion
  4. Casino        — incremental via InsertDate
  5. Transactions  — incremental via DateVersion (can be large on first run)
  6. Betslips      — largest, run separately when ready

After extraction, run the KPI transforms:
  python -m src.kpis.build_daily_kpis
  python -m src.kpis.build_domain_kpis

Usage:
  Connect to VPN first, then:
    python run_small_extracts.py                  # runs 1-5
    python run_small_extracts.py --all            # runs 1-6 (includes betslips)
    python run_small_extracts.py --transform      # runs 1-5 + KPI transforms
    python run_small_extracts.py --show-watermarks  # print current watermark values
    python run_small_extracts.py --reset-watermarks # reset ALL watermarks to 90 days ago
"""
from __future__ import annotations

import os
import sqlite3
import sys
import time
import traceback
from datetime import datetime, timedelta, UTC
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
WATERMARK_DB = str((PROJECT_ROOT / "data" / "watermarks.db").resolve())

ALL_VIEWS = [
    "Dwh_en.view_SportDirectCommissions",
    "Dwh_en.view_SportNetworkCommissions",
    "Dwh_en.view_CasinoDirectCommissions",
    "Dwh_en.view_CasinoNetworkCommissions",
    "Dwh_en.view_BonusCampaigns",
    "Dwh_en.view_BonusFreebets",
    "Dwh_en.view_BonusBonuses",
    "Dwh_en.view_users",
    "Dwh_en.view_Casino",
    "Dwh_en.view_Transactions",
    "Dwh_en.view_BetSlips",
]


def _days_ago(days: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")


def show_watermarks():
    """Print current watermark values for all known views."""
    if not Path(WATERMARK_DB).exists():
        print("watermarks.db not found — no extracts have run yet.")
        return
    conn = sqlite3.connect(WATERMARK_DB)
    rows = conn.execute("SELECT view_name, last_value, updated_at FROM watermarks ORDER BY view_name").fetchall()
    conn.close()
    print(f"\n{'View':<45} {'Watermark':<26} {'Updated'}")
    print("-" * 95)
    for view_name, last_value, updated_at in rows:
        print(f"{view_name:<45} {last_value:<26} {updated_at}")
    print()


def reset_watermarks(days: int = 90):
    """Reset ALL watermarks to N days ago (default 90)."""
    cutoff = _days_ago(days)
    Path(WATERMARK_DB).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(WATERMARK_DB)
    cur = conn.cursor()
    cur.execute(
        "CREATE TABLE IF NOT EXISTS watermarks "
        "(view_name TEXT PRIMARY KEY, last_value TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    now = datetime.now(UTC).isoformat(timespec="seconds")
    for view in ALL_VIEWS:
        cur.execute(
            "INSERT INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(view_name) DO UPDATE SET last_value=excluded.last_value, updated_at=excluded.updated_at",
            (view, cutoff, now),
        )
    conn.commit()
    conn.close()
    print(f"\n  ✓ All {len(ALL_VIEWS)} watermarks reset to {cutoff} ({days} days ago)\n")

# ── Which modules to run ─────────────────────────────────────────────────────
SMALL_EXTRACTS = [
    ("commissions", "src.extract.incremental_commissions"),
    ("bonus",       "src.extract.incremental_bonus"),
    ("users",       "src.extract.incremental_users"),
    ("casino",      "src.extract.incremental_casino"),
    ("transactions","src.extract.incremental_transactions"),
]

LARGE_EXTRACTS = [
    ("betslips",    "src.extract.incremental_betslips"),
]

TRANSFORM_MODULES = [
    ("daily_kpis",   "src.kpis.build_daily_kpis"),
    ("domain_kpis",  "src.kpis.build_domain_kpis"),
]


def run_module(label: str, module_path: str) -> bool:
    """Import and run a module's main() function. Returns True on success."""
    print(f"\n{'='*60}")
    print(f"  Running: {label}  ({module_path})")
    print(f"{'='*60}")
    t0 = time.time()
    try:
        import importlib
        mod = importlib.import_module(module_path)
        mod.main()
        elapsed = time.time() - t0
        print(f"\n  ✓ {label} completed in {elapsed:.1f}s")
        return True
    except Exception as e:
        elapsed = time.time() - t0
        print(f"\n  ✗ {label} FAILED after {elapsed:.1f}s: {e}")
        traceback.print_exc()
        return False


def main():
    # Utility commands — run and exit without connecting to DWH
    if "--show-watermarks" in sys.argv:
        show_watermarks()
        return
    if "--reset-watermarks" in sys.argv:
        days = int(os.environ.get("INITIAL_LOAD_DAYS", "90"))
        reset_watermarks(days)
        show_watermarks()
        return

    run_all    = "--all" in sys.argv
    run_transforms = "--transform" in sys.argv

    modules = SMALL_EXTRACTS.copy()
    if run_all:
        modules += LARGE_EXTRACTS
    if run_transforms:
        modules += TRANSFORM_MODULES

    print(f"\nPlaya Bets — Extract Pipeline")
    print(f"Running {len(modules)} module(s): {[m[0] for m in modules]}\n")

    results = {}
    for label, path in modules:
        results[label] = run_module(label, path)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    for label, ok in results.items():
        status = "✓ OK" if ok else "✗ FAILED"
        print(f"  {status:10s}  {label}")

    failed = [k for k, v in results.items() if not v]
    if failed:
        print(f"\n  {len(failed)} module(s) failed: {failed}")
        sys.exit(1)
    else:
        print(f"\n  All {len(results)} module(s) completed successfully.")
        if not run_transforms:
            print("\n  Next step — run KPI transforms:")
            print("    python run_small_extracts.py --transform")
            print("  Or run transforms manually:")
            print("    python -m src.kpis.build_daily_kpis")
            print("    python -m src.kpis.build_domain_kpis")


if __name__ == "__main__":
    main()
