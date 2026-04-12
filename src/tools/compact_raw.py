"""
compact_raw.py
--------------
Merges all increment parquet files in each raw directory into a single
*_full.parquet file, then deletes the increments.

Run manually or via the scheduler (daily).

    python -m src.tools.compact_raw
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from src.app_config import raw_dir

log = logging.getLogger("compact_raw")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ── Per-source configuration ──────────────────────────────────────────────────
# increment_glob : pattern that matches increment files to merge
# full_name      : output filename after compaction
# dedup_col      : column to deduplicate on (keep last occurrence); None = no dedup
SOURCES = [
    {
        "dir": raw_dir("betslips"),
        "increment_glob": "betslips_increment_*.parquet",
        "full_name": "betslips_full.parquet",
        "dedup_col": "BetSlipID",
        "sort_col": "DateVersion",
    },
    {
        "dir": raw_dir("users"),
        "increment_glob": "users_increment_*.parquet",
        "full_name": "users_full.parquet",
        "dedup_col": "userid",
        "sort_col": "dateversion",
    },
    {
        "dir": raw_dir("sessions"),
        "increment_glob": "sessions_increment_*.parquet",
        "full_name": "sessions_full.parquet",
        "dedup_col": "sessionid",
        "sort_col": None,
    },
    {
        "dir": raw_dir("first_deposits"),
        "increment_glob": "first_deposits_increment_*.parquet",
        "full_name": "first_deposits_full.parquet",
        "dedup_col": "idutente",
        "sort_col": None,
    },
    {
        "dir": raw_dir("bonus"),
        "increment_glob": "bonus_increment_*.parquet",
        "full_name": "bonus_full.parquet",
        "dedup_col": "BonusID",
        "sort_col": "DateVersion",
    },
    {
        "dir": raw_dir("casino"),
        "increment_glob": "casino_increment_*.parquet",
        "full_name": "casino_full.parquet",
        "dedup_col": "CasinoID",
        "sort_col": "InsertDate",
    },
]


def compact_source(
    directory: Path,
    increment_glob: str,
    full_name: str,
    dedup_col: str | None,
    sort_col: str | None,
) -> int:
    """Compact increments into full file. Returns number of files merged."""
    if not directory.exists():
        return 0

    inc_files = sorted(directory.glob(increment_glob))
    if not inc_files:
        log.info("[%s] No increment files found — skipping", directory.name)
        return 0

    full_path = directory / full_name

    # Load existing full file if present
    frames = []
    if full_path.exists():
        try:
            frames.append(pd.read_parquet(full_path))
            log.info("[%s] Loaded existing full file (%d rows)", directory.name, len(frames[0]))
        except Exception as exc:
            log.warning("[%s] Could not read existing full file: %s", directory.name, exc)

    # Load all increments
    for f in inc_files:
        try:
            frames.append(pd.read_parquet(f))
        except Exception as exc:
            log.warning("[%s] Could not read %s: %s", directory.name, f.name, exc)

    if not frames:
        return 0

    combined = pd.concat(frames, ignore_index=True)

    # Deduplicate — sort first so we keep the latest record
    if dedup_col and dedup_col in combined.columns:
        if sort_col and sort_col in combined.columns:
            combined = combined.sort_values(sort_col, ascending=True)
        combined = combined.drop_duplicates(subset=[dedup_col], keep="last")

    combined.to_parquet(full_path, index=False)
    log.info(
        "[%s] Wrote %s (%d rows) from %d increment file(s)",
        directory.name, full_name, len(combined), len(inc_files),
    )

    # Delete increment files now that they are merged
    for f in inc_files:
        try:
            f.unlink()
        except Exception as exc:
            log.warning("[%s] Could not delete %s: %s", directory.name, f.name, exc)

    return len(inc_files)


def compact_transactions(directory: Path) -> int:
    """Compact daily transaction agg files into transactions_agg_full.parquet.

    Transaction files are already one-row-per-day aggregates, so dedup is by
    date (keeping the latest file's value for any given date).
    """
    if not directory.exists():
        return 0

    inc_files = sorted(directory.glob("transactions_daily_agg_*.parquet"))
    if not inc_files:
        log.info("[transactions] No increment files found — skipping")
        return 0

    full_path = directory / "transactions_agg_full.parquet"

    frames = []
    if full_path.exists():
        try:
            frames.append(pd.read_parquet(full_path))
            log.info("[transactions] Loaded existing full file (%d rows)", len(frames[0]))
        except Exception as exc:
            log.warning("[transactions] Could not read existing full file: %s", exc)

    for f in inc_files:
        try:
            frames.append(pd.read_parquet(f))
        except Exception as exc:
            log.warning("[transactions] Could not read %s: %s", f.name, exc)

    if not frames:
        return 0

    combined = pd.concat(frames, ignore_index=True)
    combined["date"] = pd.to_datetime(combined["date"]).dt.date
    combined = combined.sort_values("date").drop_duplicates(subset=["date"], keep="last")

    combined.to_parquet(full_path, index=False)
    log.info(
        "[transactions] Wrote transactions_agg_full.parquet (%d rows) from %d increment file(s)",
        len(combined), len(inc_files),
    )

    for f in inc_files:
        try:
            f.unlink()
        except Exception as exc:
            log.warning("[transactions] Could not delete %s: %s", f.name, exc)

    return len(inc_files)


def main() -> None:
    total = 0
    for src in SOURCES:
        merged = compact_source(
            directory=src["dir"],
            increment_glob=src["increment_glob"],
            full_name=src["full_name"],
            dedup_col=src.get("dedup_col"),
            sort_col=src.get("sort_col"),
        )
        total += merged

    # Transactions use pre-aggregated daily files — compact separately.
    from src.app_config import raw_dir as _raw_dir
    total += compact_transactions(_raw_dir("transactions"))

    log.info("Compaction complete — %d increment files merged and deleted", total)


if __name__ == "__main__":
    main()
