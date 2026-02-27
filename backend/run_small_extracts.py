"""
run_small_extracts.py
----------------------
Run one, several, or all extract modules.

Available modules:
  commissions   — 4 commission views (full-refresh)
  bonus         — BonusBonuses (incremental) + Campaigns/Freebets (full-refresh)
  users         — view_users (incremental via DateVersion)
  casino        — view_casino (incremental via InsertDate)
  transactions  — view_bonustransactions (incremental via DateVersion)
  betslips      — view_betslips (incremental via DateVersion, LARGE)

Usage examples:
  python run_small_extracts.py                          # runs all except betslips
  python run_small_extracts.py users                    # run only users
  python run_small_extracts.py bonus casino             # run bonus then casino
  python run_small_extracts.py users casino betslips    # run 3 specific modules
  python run_small_extracts.py --all                    # run all including betslips
  python run_small_extracts.py --transform              # run all + KPI transforms
  python run_small_extracts.py users --transform        # run users + KPI transforms
  python run_small_extracts.py --show-watermarks               # print current watermarks
  python run_small_extracts.py --set-watermarks-today          # set stale rows to today
  python run_small_extracts.py --reset-watermarks              # reset ALL to 90 days ago
  python run_small_extracts.py --reset-watermarks transactions  # reset only transactions
  python run_small_extracts.py --reset-watermarks casino        # reset only casino

Environment variables:
  DWH_USER            — SQL Server login (required for extract runs)
  DWH_PASS            — SQL Server password (required for extract runs)
  INITIAL_LOAD_DAYS   — Days to look back on first run (default: 90)
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

# ── Module registry ───────────────────────────────────────────────────────────
MODULES: dict[str, str] = {
    "commissions":  "src.extract.incremental_commissions",
    "bonus":        "src.extract.incremental_bonus",
    "users":        "src.extract.incremental_users",
    "casino":       "src.extract.incremental_casino",
    "transactions": "src.extract.incremental_transactions",
    "first_deposits": "src.extract.incremental_first_deposits",
    "betslips":     "src.extract.incremental_betslips",
}

TRANSFORM_MODULES: dict[str, str] = {
    "daily_kpis":  "src.kpis.build_daily_kpis",
    "domain_kpis": "src.kpis.build_domain_kpis",
}

# Default run order when no specific modules are given (excludes betslips)
DEFAULT_ORDER = ["commissions", "bonus", "users", "casino", "transactions", "first_deposits"]

# Maps each module name to the view names it writes watermarks for
MODULE_VIEWS: dict[str, list[str]] = {
    "commissions":  [
        "Dwh_en.view_sportdirectcommissions",
        "Dwh_en.view_sportnetworkcommissions",
        "Dwh_en.view_casinodirectcommissions",
        "Dwh_en.view_casinonetworkcommissions",
        "Dwh_en.view_pokerdirectcommissions",
        "Dwh_en.view_pokernetworkcommissions",
    ],
    "bonus":        [
        "Dwh_en.view_bonusbonuses",
        "Dwh_en.view_bonuscampaigns",
        "Dwh_en.view_bonusfreebets",
    ],
    "users":        ["Dwh_en.view_users"],
    "casino":       ["Dwh_en.view_casino"],
    "transactions": ["Dwh_en.view_transactions"],
    "first_deposits": ["Stats.Transazioni_DepositiUtente"],
    "betslips":     ["Dwh_en.view_betslips"],
}

# ── Watermark management ──────────────────────────────────────────────────────
ALL_VIEWS = [
    # Commissions
    "Dwh_en.view_sportdirectcommissions",
    "Dwh_en.view_sportnetworkcommissions",
    "Dwh_en.view_casinodirectcommissions",
    "Dwh_en.view_casinonetworkcommissions",
    "Dwh_en.view_pokerdirectcommissions",
    "Dwh_en.view_pokernetworkcommissions",
    # Bonus
    "Dwh_en.view_bonuscampaigns",
    "Dwh_en.view_bonusfreebets",
    "Dwh_en.view_bonusbonuses",
    "Dwh_en.view_bonustransactions",
    # Core
    "Dwh_en.view_users",
    "Dwh_en.view_casino",
    "Dwh_en.view_payments",
    "Stats.Transazioni_DepositiUtente",
    "Dwh_en.view_betslips",
    # Legacy mixed-case names from old code — reset these too
    "Dwh_en.view_BonusBonuses",
    "Dwh_en.view_BonusCampaigns",
    "Dwh_en.view_BonusFreebets",
    "Dwh_en.view_Casino",
    "Dwh_en.view_BetSlips",
    "Dwh_en.view_Transactions",
    "Dwh_en.view_SportDirectCommissions",
    "Dwh_en.view_SportNetworkCommissions",
    "Dwh_en.view_CasinoDirectCommissions",
    "Dwh_en.view_CasinoNetworkCommissions",
]


def _days_ago(days: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")


def show_watermarks():
    """Print current watermark values for all known views."""
    if not Path(WATERMARK_DB).exists():
        print("watermarks.db not found — no extracts have run yet.")
        return
    conn = sqlite3.connect(WATERMARK_DB)
    rows = conn.execute(
        "SELECT view_name, last_value, updated_at FROM watermarks ORDER BY view_name"
    ).fetchall()
    conn.close()
    print(f"\n{'View':<45} {'Watermark':<26} {'Updated'}")
    print("-" * 95)
    for view_name, last_value, updated_at in rows:
        print(f"{view_name:<45} {last_value:<26} {updated_at}")
    print()


def reset_module_watermarks(module: str, days: int = 90):
    """Reset watermarks for a single module's views only."""
    if module not in MODULE_VIEWS:
        print(f"Unknown module '{module}'. Available: {list(MODULE_VIEWS.keys())}")
        sys.exit(1)
    views = MODULE_VIEWS[module]
    cutoff = _days_ago(days)
    Path(WATERMARK_DB).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(WATERMARK_DB)
    cur = conn.cursor()
    cur.execute(
        "CREATE TABLE IF NOT EXISTS watermarks "
        "(view_name TEXT PRIMARY KEY, last_value TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    now = datetime.now(UTC).isoformat(timespec="seconds")
    for view in views:
        cur.execute(
            "INSERT INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(view_name) DO UPDATE SET last_value=excluded.last_value, updated_at=excluded.updated_at",
            (view, cutoff, now),
        )
    conn.commit()
    conn.close()
    print(f"\n  ✓ {module} watermark(s) reset to {cutoff} ({days} days ago)")
    for v in views:
        print(f"    {v}")
    print()


def set_watermarks_today():
    """Set all stale (pre-2026) watermarks to today, leaving recent ones untouched."""
    if not Path(WATERMARK_DB).exists():
        print("watermarks.db not found.")
        return
    today = datetime.now(UTC).strftime("%Y-%m-%d 00:00:00")
    now = datetime.now(UTC).isoformat(timespec="seconds")
    conn = sqlite3.connect(WATERMARK_DB)
    cur = conn.cursor()
    # Only update rows where the watermark is before 2026-01-01
    cur.execute(
        "UPDATE watermarks SET last_value=?, updated_at=? WHERE last_value < '2026-01-01'",
        (today, now),
    )
    updated = cur.rowcount
    conn.commit()
    conn.close()
    print(f"\n  ✓ {updated} stale watermark(s) set to {today}")
    print("  (rows already at 2026+ were left unchanged)\n")


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


# ── Module runner ─────────────────────────────────────────────────────────────
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


# ── Argument parsing ──────────────────────────────────────────────────────────
def parse_args():
    """
    Returns (modules_to_run: list[str], run_transforms: bool)

    Logic:
    - If --show-watermarks or --reset-watermarks: handle and exit
    - Positional args that match module names → run those specific modules
    - --all → run all modules including betslips
    - No positional args → run DEFAULT_ORDER (all except betslips)
    - --transform → append transform modules to the run list
    """
    args = sys.argv[1:]

    # Utility commands — no DWH connection needed
    if "--show-watermarks" in args:
        show_watermarks()
        sys.exit(0)
    if "--set-watermarks-today" in args:
        set_watermarks_today()
        show_watermarks()
        sys.exit(0)
    if "--reset-watermarks" in args:
        days = int(os.environ.get("INITIAL_LOAD_DAYS", "90"))
        idx = args.index("--reset-watermarks")
        # Check if a module name follows the flag
        if idx + 1 < len(args) and not args[idx + 1].startswith("--"):
            module = args[idx + 1]
            reset_module_watermarks(module, days)
        else:
            reset_watermarks(days)
        show_watermarks()
        sys.exit(0)

    run_transforms = "--transform" in args
    run_all = "--all" in args

    # Collect positional module names (anything that matches a known module)
    flags = {"--all", "--transform"}
    requested = [a for a in args if a not in flags]
    unknown = [a for a in requested if a not in MODULES]
    if unknown:
        print(f"\nUnknown module(s): {unknown}")
        print(f"Available: {list(MODULES.keys())}")
        sys.exit(1)

    if run_all:
        modules = list(MODULES.keys())
    elif requested:
        modules = requested
    else:
        modules = DEFAULT_ORDER

    return modules, run_transforms


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    modules_to_run, run_transforms = parse_args()

    run_list = [(name, MODULES[name]) for name in modules_to_run]
    if run_transforms:
        run_list += list(TRANSFORM_MODULES.items())

    print(f"\nPlaya Bets — Extract Pipeline")
    print(f"Running {len(run_list)} module(s): {[m[0] for m in run_list]}\n")

    results = {}
    for label, path in run_list:
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
            print("\n  Tip — run KPI transforms when ready:")
            print("    python run_small_extracts.py --transform")


if __name__ == "__main__":
    main()
