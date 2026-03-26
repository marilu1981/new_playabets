"""
export_serving_csvs.py
----------------------
Convert the main serving parquet files to CSV for Supabase upload.

Run from the project root inside the activated venv:
    python .\scripts\export_serving_csvs.py

Optional:
    python .\scripts\export_serving_csvs.py --include-transactions
    python .\scripts\export_serving_csvs.py --include-legacy-segments
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, UTC
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVING_DIR = PROJECT_ROOT / "data" / "serving"


DEFAULT_EXPORTS = [
    "daily_kpis",
    "rfm_users",
    "bonus_daily",
    "conversion_cohorts_daily",
    "ftd_daily",
    "casino_daily",
    "casino_providers_daily",
]

LEGACY_EXPORTS = [
    "users_segments_daily",
    "users_segments_latest",
]

OPTIONAL_EXPORTS = [
    "transactions_daily",
]


def log(message: str) -> None:
    ts = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[export_csvs] {ts} UTC | {message}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export serving parquet files to CSV.")
    parser.add_argument(
        "--include-transactions",
        action="store_true",
        help="Also export transactions_daily.parquet if it exists.",
    )
    parser.add_argument(
        "--include-legacy-segments",
        action="store_true",
        help="Also export obsolete users_segments_* files if they still exist.",
    )
    return parser.parse_args()


def load_backend() -> tuple[str, object]:
    try:
        import duckdb  # type: ignore
        return "duckdb", duckdb
    except ModuleNotFoundError:
        try:
            import pandas as pd  # type: ignore
            return "pandas", pd
        except ModuleNotFoundError as exc:
            raise SystemExit(
                "Neither duckdb nor pandas is available in this environment."
            ) from exc


def export_with_duckdb(duckdb_mod, parquet_path: Path, csv_path: Path) -> None:
    duckdb_mod.sql(
        f"""
        COPY (
          SELECT * FROM read_parquet('{parquet_path.as_posix()}')
        ) TO '{csv_path.as_posix()}' (HEADER, DELIMITER ',')
        """
    )


def export_with_pandas(pd_mod, parquet_path: Path, csv_path: Path) -> None:
    df = pd_mod.read_parquet(parquet_path)
    df.to_csv(csv_path, index=False)


def main() -> None:
    args = parse_args()
    backend_name, backend = load_backend()
    log(f"Project root: {PROJECT_ROOT}")
    log(f"Serving dir: {SERVING_DIR}")
    log(f"Export backend: {backend_name}")

    targets = list(DEFAULT_EXPORTS)
    if args.include_transactions:
        targets.extend(OPTIONAL_EXPORTS)
    if args.include_legacy_segments:
        targets.extend(LEGACY_EXPORTS)

    exported = 0
    skipped = 0

    for stem in targets:
        parquet_path = SERVING_DIR / f"{stem}.parquet"
        csv_path = SERVING_DIR / f"{stem}.csv"

        if not parquet_path.exists():
            log(f"SKIP {parquet_path.name} (file not found)")
            skipped += 1
            continue

        log(f"START {parquet_path.name}")
        if backend_name == "duckdb":
            export_with_duckdb(backend, parquet_path, csv_path)
        else:
            export_with_pandas(backend, parquet_path, csv_path)

        size_mb = csv_path.stat().st_size / (1024 * 1024)
        log(f"DONE  {csv_path.name} ({size_mb:.2f} MB)")
        exported += 1

    log(f"Export complete | exported={exported} | skipped={skipped}")
    log("Next step: upload the refreshed CSVs from data/serving into Supabase.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Interrupted by user.")
        sys.exit(130)
