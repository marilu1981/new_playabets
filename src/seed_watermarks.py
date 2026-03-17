"""
seed_watermarks.py
------------------
Create missing local SQLite watermark rows for incremental extractors without
changing existing values.

Run from project root:
    python -m src.seed_watermarks
"""
from __future__ import annotations

from pathlib import Path

from src.extract.db_utils import get_watermark

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"

SEED_VIEWS = [
    "Dwh_en.view_users",
    "Dwh_en.view_betslips",
    "Dwh_en.view_casino",
    "Dwh_en.view_bonusbonuses",
    "Stats.Transazioni_DepositiUtente",
    "Dwh_en.view_balances",
]


def main() -> None:
    print(f"[seed_watermarks] DB: {WATERMARK_DB}")
    for view_name in SEED_VIEWS:
        value = get_watermark(WATERMARK_DB, view_name)
        print(f"[seed_watermarks] {view_name} -> {value}")
    print("[seed_watermarks] Done.")


if __name__ == "__main__":
    main()
