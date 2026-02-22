"""
incremental_commissions.py
---------------------------
Pulls commission records from four views (full-refresh each run).

Run from the project root:
    python -m src.extract.incremental_commissions
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from sqlalchemy import text

from src.extract.db_utils import build_engine

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "commissions"

VIEWS = {
    "sport_direct": {
        "view": "Dwh_en.view_sportdirectcommissions",
        "cols": [
            "CommissionID", "UserID", "Stake", "Winnings", "Commissions",
            "CreationDate", "DateStart", "DateEnd",
            "CommissionProduct", "CommissionType", "CommissionCategory", "CommissionStatus",
        ],
    },
    "sport_network": {
        "view": "Dwh_en.view_sportnetworkcommissions",
        "cols": [
            "CommissionID", "UserID", "Stake", "Winnings",
            "PaidBS", "PaidNetwork", "Commissions",
            "CreationDate", "DateStart", "DateEnd",
            "CommissionProduct", "CommissionType", "CommissionCategory", "CommissionStatus",
        ],
    },
    "casino_direct": {
        "view": "Dwh_en.view_casinodirectcommissions",
        "cols": [
            "CommissionID", "UserID", "Stake", "Winnings", "Commissions",
            "CreationDate", "DateStart", "DateEnd",
            "CommissionProduct", "CommissionType", "CommissionCategory", "CommissionStatus",
        ],
    },
    "casino_network": {
        "view": "Dwh_en.view_casinonetworkcommissions",
        "cols": [
            "CommissionID", "UserID", "Played", "Winnings",
            "PaidBS", "PaidNetwork", "Commissions",
            "CreationDate", "DateStart", "DateEnd",
            "CommissionProduct", "CommissionType", "CommissionCategory", "CommissionStatus",
        ],
    },
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    engine = build_engine()
    frames = []

    for key, cfg in VIEWS.items():
        cols_sql = ", ".join(cfg["cols"])
        with engine.connect() as conn:
            df = pd.read_sql(text(f"SELECT {cols_sql} FROM {cfg['view']}"), conn)
        df["_source"] = key
        print(f"[commissions] {key}: {len(df)} rows")
        df.to_parquet(OUT_DIR / f"{key}_full.parquet", index=False)
        frames.append(df)

    if frames:
        combined = pd.concat(frames, ignore_index=True)
        combined.to_parquet(OUT_DIR / f"commissions_snapshot_{ts}.parquet", index=False)
        print(f"[commissions] Combined snapshot: {len(combined)} rows -> {OUT_DIR}")


if __name__ == "__main__":
    main()
