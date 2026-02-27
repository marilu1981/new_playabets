"""
scheduler.py — Playa Bets 2-hourly Data Pipeline Scheduler
============================================================
Runs the full extract → transform pipeline on a 2-hour interval.

Usage:
    # Run once immediately, then every 2 hours:
    python -m src.scheduler

    # Or with a custom interval (minutes):
    SCHEDULE_INTERVAL_MINUTES=60 python -m src.scheduler

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password

Optional:
    SCHEDULE_INTERVAL_MINUTES  – override the default 120-minute interval
    SKIP_EXTRACT               – set to "1" to skip extract (transform only)
    LOG_LEVEL                  – DEBUG | INFO | WARNING (default: INFO)
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from datetime import datetime, UTC
from pathlib import Path

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("scheduler")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
INTERVAL_MINUTES = int(os.environ.get("SCHEDULE_INTERVAL_MINUTES", "120"))
SKIP_EXTRACT = os.environ.get("SKIP_EXTRACT", "0") == "1"

EXTRACT_MODULES = [
    "src.extract.incremental_users",
    "src.extract.incremental_betslips",
    "src.extract.incremental_transactions",
    "src.extract.incremental_first_deposits",
    "src.extract.incremental_bonus",
    "src.extract.incremental_casino",
    "src.extract.incremental_commissions",
]

TRANSFORM_MODULES = [
    "src.kpis.build_daily_kpis",   # builds daily_kpis.parquet + rfm_users.parquet
    "src.kpis.build_domain_kpis",  # builds transactions/bonus/casino/commissions serving files
]


def _run_module(module: str) -> bool:
    """Run a Python module as a subprocess. Returns True on success."""
    cmd = [sys.executable, "-m", module]
    log.info("Running: %s", " ".join(cmd))
    result = subprocess.run(
        cmd,
        cwd=str(PROJECT_ROOT),
        capture_output=False,
        text=True,
    )
    if result.returncode != 0:
        log.error("Module %s exited with code %d", module, result.returncode)
        return False
    log.info("Module %s completed successfully", module)
    return True


def run_pipeline() -> None:
    """Execute the full extract → transform pipeline."""
    started = datetime.now(UTC)
    log.info("=" * 60)
    log.info("Pipeline started at %s", started.isoformat())

    errors: list[str] = []

    # --- Extract ---
    if not SKIP_EXTRACT:
        log.info("--- EXTRACT PHASE ---")
        for module in EXTRACT_MODULES:
            try:
                ok = _run_module(module)
                if not ok:
                    errors.append(f"extract:{module}")
            except Exception as exc:
                log.exception("Unexpected error in %s: %s", module, exc)
                errors.append(f"extract:{module}:{exc}")
    else:
        log.info("SKIP_EXTRACT=1 — skipping extract phase")

    # --- Transform ---
    log.info("--- TRANSFORM PHASE ---")
    for module in TRANSFORM_MODULES:
        try:
            ok = _run_module(module)
            if not ok:
                errors.append(f"transform:{module}")
        except Exception as exc:
            log.exception("Unexpected error in %s: %s", module, exc)
            errors.append(f"transform:{module}:{exc}")

    elapsed = (datetime.now(UTC) - started).total_seconds()
    if errors:
        log.warning("Pipeline completed with %d error(s) in %.1fs: %s", len(errors), elapsed, errors)
    else:
        log.info("Pipeline completed successfully in %.1fs", elapsed)
    log.info("=" * 60)


def main() -> None:
    log.info("Playa Bets Scheduler starting — interval: %d minutes", INTERVAL_MINUTES)
    log.info("Project root: %s", PROJECT_ROOT)

    # Run immediately on start
    run_pipeline()

    # Then loop
    interval_seconds = INTERVAL_MINUTES * 60
    while True:
        next_run = datetime.now(UTC).replace(microsecond=0)
        log.info("Next run in %d minutes (at ~%s UTC)", INTERVAL_MINUTES,
                 datetime.fromtimestamp(time.time() + interval_seconds).strftime("%H:%M:%S"))
        time.sleep(interval_seconds)
        run_pipeline()


if __name__ == "__main__":
    main()
