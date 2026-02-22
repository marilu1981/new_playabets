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
    python run_small_extracts.py              # runs 1-5
    python run_small_extracts.py --all        # runs 1-6 (includes betslips)
    python run_small_extracts.py --transform  # runs 1-5 + KPI transforms
"""
from __future__ import annotations

import sys
import time
import traceback

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
