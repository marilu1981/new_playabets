"""
incremental_bonus.py
---------------------
Pulls new/updated rows from three Bonus views:
  - Dwh_en.view_BonusBonuses       (incremental via DateVersion)
  - Dwh_en.view_BonusCampaigns     (full-refresh — small reference table)
  - Dwh_en.view_BonusFreebets      (full-refresh)

Run from the project root:
    python -m src.extract.incremental_bonus

Environment variables required:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password
"""
from __future__ import annotations

import os
import sqlite3
import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------
SERVER   = "playabets-dwh-aurora-prd.cluster-cx4oskcc63z8.eu-west-1.rds.amazonaws.com"
PORT     = 1433
DATABASE = "isbets_bi"
USERNAME = os.environ["DWH_USER"]
PASSWORD = os.environ["DWH_PASS"]

BONUSES_VIEW   = "Dwh_en.view_BonusBonuses"
CAMPAIGNS_VIEW = "Dwh_en.view_BonusCampaigns"
FREEBETS_VIEW  = "Dwh_en.view_BonusFreebets"
CURSOR_COLUMN  = "DateVersion"

BONUSES_COLUMNS = [
    "BonusID", "UserID", "CampaignID", "Amount", "CurrencyID",
    "CurrencyExchangeID", "BonusStatusID", "BonusStatus",
    "CalculationBaseAmount", "InsertDate", "Manual",
    "ExpiryDate", "MasterCampaignId", "DateVersion",
]
CAMPAIGNS_COLUMNS = [
    "CampaignID", "BookmakerID", "BonusTypeID", "BonusType",
    "WithdrawalTypeID", "WithdrawalType", "CampaignStatusID",
    "CampaignStatus", "Name", "Code", "InsertDate",
    "ValidityStartDate", "ValidityEndDate", "ManualBonusEnabled",
    "AutomaticBalanceTransfer", "AutomaticBonusCredit", "MasterCampaignID",
]
FREEBETS_COLUMNS = [
    "FreeBetID", "UserID", "CampaignID", "InsertDate", "Amount",
    "FreeBetStatusId", "FreeBetStatus", "ExpiryDate", "CreationCouponId",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "bonus"


def _build_engine():
    params = quote_plus(
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={SERVER},{PORT};DATABASE={DATABASE};"
        f"UID={USERNAME};PWD={PASSWORD};"
        "Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=30;"
    )
    return create_engine(f"mssql+pyodbc:///?odbc_connect={params}", fast_executemany=True)


def _get_watermark(view_name: str) -> str:
    WATERMARK_DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(WATERMARK_DB) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS watermarks "
            "(view_name TEXT PRIMARY KEY, last_value TEXT NOT NULL, updated_at TEXT NOT NULL)"
        )
        conn.execute(
            "INSERT OR IGNORE INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?)",
            (view_name, "1970-01-01 00:00:00", datetime.now(UTC).isoformat(timespec="seconds")),
        )
        conn.commit()
        return conn.execute(
            "SELECT last_value FROM watermarks WHERE view_name = ?", (view_name,)
        ).fetchone()[0]


def _set_watermark(view_name: str, value: str) -> None:
    with sqlite3.connect(WATERMARK_DB) as conn:
        conn.execute(
            "UPDATE watermarks SET last_value = ?, updated_at = ? WHERE view_name = ?",
            (value, datetime.now(UTC).isoformat(timespec="seconds"), view_name),
        )
        conn.commit()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")

    engine = _build_engine()

    # 1. Incremental: view_BonusBonuses
    last_value = _get_watermark(BONUSES_VIEW)
    print(f"[bonus] BonusBonuses watermark: {last_value}")
    cols_sql = ", ".join(BONUSES_COLUMNS)
    query = text(f"""
        SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql}
        FROM {BONUSES_VIEW}
        WHERE {CURSOR_COLUMN} > :last_value
    """)
    with engine.connect() as conn:
        df_bonuses = pd.read_sql(query, conn, params={"last_value": last_value})
    print(f"[bonus] BonusBonuses rows: {len(df_bonuses)}")
    if not df_bonuses.empty:
        df_bonuses.to_parquet(OUT_DIR / f"bonuses_increment_{ts}.parquet", index=False)
        _set_watermark(BONUSES_VIEW, str(df_bonuses["__cursor__"].max()))
        print(f"[bonus] BonusBonuses watermark updated to: {df_bonuses['__cursor__'].max()}")

    # 2. Full-refresh: view_BonusCampaigns
    print("[bonus] Pulling BonusCampaigns (full-refresh)...")
    cols_sql = ", ".join(CAMPAIGNS_COLUMNS)
    with engine.connect() as conn:
        df_campaigns = pd.read_sql(text(f"SELECT {cols_sql} FROM {CAMPAIGNS_VIEW}"), conn)
    print(f"[bonus] BonusCampaigns rows: {len(df_campaigns)}")
    df_campaigns.to_parquet(OUT_DIR / "campaigns_latest.parquet", index=False)

    # 3. Full-refresh: view_BonusFreebets
    print("[bonus] Pulling BonusFreebets (full-refresh)...")
    cols_sql = ", ".join(FREEBETS_COLUMNS)
    with engine.connect() as conn:
        df_freebets = pd.read_sql(text(f"SELECT {cols_sql} FROM {FREEBETS_VIEW}"), conn)
    print(f"[bonus] BonusFreebets rows: {len(df_freebets)}")
    df_freebets.to_parquet(OUT_DIR / "freebets_latest.parquet", index=False)

    print(f"[bonus] Done. Files written to {OUT_DIR}")


if __name__ == "__main__":
    main()
