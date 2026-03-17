"""
reset_watermarks.py
-------------------
Force selected watermark rows to a fixed value for backfill/replay work.

Run from project root:
    python -m src.reset_watermarks
"""
from __future__ import annotations

import os
from pathlib import Path

from src.extract.db_utils import get_watermark, set_watermark

PROJECT_ROOT = Path(__file__).resolve().parents[1]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
TARGET_WATERMARK = os.environ.get("RESET_WATERMARK_TO", "2026-02-27 00:00:00")

TARGET_VIEWS = [
    "Dwh_en.view_users",
    "Dwh_en.view_betslips",
    "Dwh_en.view_casino",
    "Dwh_en.view_bonusbonuses",
    "Stats.Transazioni_DepositiUtente",
    "Dwh_en.view_balances",
]


def main() -> None:
    print(f"[reset_watermarks] DB: {WATERMARK_DB}")
    print(f"[reset_watermarks] Target watermark: {TARGET_WATERMARK}")
    for view_name in TARGET_VIEWS:
        previous = get_watermark(WATERMARK_DB, view_name, default=TARGET_WATERMARK)
        set_watermark(WATERMARK_DB, view_name, TARGET_WATERMARK)
        print(f"[reset_watermarks] {view_name}: {previous} -> {TARGET_WATERMARK}")
    print("[reset_watermarks] Done.")


if __name__ == "__main__":
    main()
