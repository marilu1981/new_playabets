"""
incremental_commissions.py
---------------------------
Pulls commission records from four views (full-refresh each run, as
commission tables are typically small and have no reliable DateVersion):
  - Dwh_en.view_SportDirectCommissions
  - Dwh_en.view_SportNetworkCommissions
  - Dwh_en.view_CasinoDirectCommissions
  - Dwh_en.view_CasinoNetworkCommissions

Each view is saved as its own Parquet file (full snapshot, overwritten on
each run).  A timestamped combined file is also written for auditing.

Run from the project root:
    python -m src.extract.incremental_commissions

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password
"""
from __future__ import annotations
import os, pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from urllib.parse import quote_plus
from sqlalchemy import create_engine, text

SERVER   = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT     = 1433
DATABASE = "isbets_bi"
USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _build_engine():
    params = quote_plus(
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={SERVER},{PORT};DATABASE={DATABASE};"
        f"UID={USERNAME};PWD={PASSWORD};"
        "Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=30;"
    )
    return create_engine(f"mssql+pyodbc:///?odbc_connect={params}", fast_executemany=True)


OUT_DIR = PROJECT_ROOT / "data" / "raw" / "commissions"

VIEWS = {
    "sport_direct": {
        "view": "Dwh_en.view_SportDirectCommissions",
        "cols": [
            "CommissionID", "UserID", "Stake", "Winnings", "Commissions",
            "CreationDate", "DateStart", "DateEnd",
            "CommissionProduct", "CommissionType", "CommissionCategory", "CommissionStatus",
        ],
    },
    "sport_network": {
        "view": "Dwh_en.view_SportNetworkCommissions",
        "cols": [
            "CommissionID", "UserID", "Stake", "Winnings",
            "PaidBS", "PaidNetwork", "Commissions",
            "CreationDate", "DateStart", "DateEnd",
            "CommissionProduct", "CommissionType", "CommissionCategory", "CommissionStatus",
        ],
    },
    "casino_direct": {
        "view": "Dwh_en.view_CasinoDirectCommissions",
        "cols": [
            "CommissionID", "UserID", "Stake", "Winnings", "Commissions",
            "CreationDate", "DateStart", "DateEnd",
            "CommissionProduct", "CommissionType", "CommissionCategory", "CommissionStatus",
        ],
    },
    "casino_network": {
        "view": "Dwh_en.view_CasinoNetworkCommissions",
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
    frames = []

    engine = _build_engine()
    for key, cfg in VIEWS.items():
        cols_sql = ", ".join(cfg["cols"])
        with engine.connect() as conn:
            df = pd.read_sql(text(f"SELECT {cols_sql} FROM {cfg['view']}"), conn)
        df["_source"] = key
        print(f"[commissions] {key}: {len(df)} rows")
        # Full snapshot (overwrite)
        df.to_parquet(OUT_DIR / f"{key}_full.parquet", index=False)
        frames.append(df)

    # Combined timestamped snapshot for auditing
    if frames:
        combined = pd.concat(frames, ignore_index=True)
        combined.to_parquet(OUT_DIR / f"commissions_snapshot_{ts}.parquet", index=False)
        print(f"[commissions] Combined snapshot: {len(combined)} rows -> {OUT_DIR}")


if __name__ == "__main__":
    main()
