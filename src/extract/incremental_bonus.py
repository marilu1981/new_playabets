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
import pyodbc
import pandas as pd
from datetime import datetime, UTC
from pathlib import Path

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

SQL_CONN_STR = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    f"SERVER={SERVER},{PORT};"
    f"DATABASE={DATABASE};"
    f"UID={USERNAME};"
    f"PWD={PASSWORD};"
    "Encrypt=yes;"
    "TrustServerCertificate=yes;"
    "Connection Timeout=30;"
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR      = PROJECT_ROOT / "data" / "raw" / "bonus"


def _get_watermark(view_name: str) -> str:
    with sqlite3.connect(WATERMARK_DB) as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO watermarks (view_name, last_value, updated_at) VALUES (?, ?, ?)",
            (view_name, "1970-01-01 00:00:00", datetime.now(UTC).isoformat(timespec="seconds")),
        )
        conn.commit()
        cur.execute("SELECT last_value FROM watermarks WHERE view_name = ?", (view_name,))
        return cur.fetchone()[0]


def _set_watermark(view_name: str, value: str) -> None:
    with sqlite3.connect(WATERMARK_DB) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE watermarks SET last_value = ?, updated_at = ? WHERE view_name = ?",
            (value, datetime.now(UTC).isoformat(timespec="seconds"), view_name),
        )
        conn.commit()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")

    with pyodbc.connect(SQL_CONN_STR) as conn:
        # 1. Incremental: view_BonusBonuses
        last_value = _get_watermark(BONUSES_VIEW)
        print(f"[bonus] BonusBonuses watermark: {last_value}")
        cols_sql = ", ".join(BONUSES_COLUMNS)
        df_bonuses = pd.read_sql(
            f"SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql} "
            f"FROM {BONUSES_VIEW} WHERE {CURSOR_COLUMN} > ?",
            conn, params=[last_value],
        )
        print(f"[bonus] BonusBonuses rows: {len(df_bonuses)}")
        if not df_bonuses.empty:
            df_bonuses.to_parquet(OUT_DIR / f"bonuses_increment_{ts}.parquet", index=False)
            _set_watermark(BONUSES_VIEW, str(df_bonuses["__cursor__"].max()))

        # 2. Full-refresh: view_BonusCampaigns
        cols_sql = ", ".join(CAMPAIGNS_COLUMNS)
        df_campaigns = pd.read_sql(f"SELECT {cols_sql} FROM {CAMPAIGNS_VIEW}", conn)
        print(f"[bonus] BonusCampaigns rows: {len(df_campaigns)}")
        df_campaigns.to_parquet(OUT_DIR / "campaigns_full.parquet", index=False)

        # 3. Full-refresh: view_BonusFreebets
        cols_sql = ", ".join(FREEBETS_COLUMNS)
        df_freebets = pd.read_sql(f"SELECT {cols_sql} FROM {FREEBETS_VIEW}", conn)
        print(f"[bonus] BonusFreebets rows: {len(df_freebets)}")
        df_freebets.to_parquet(OUT_DIR / "freebets_full.parquet", index=False)

    print(f"[bonus] Done. Files written to {OUT_DIR}")


if __name__ == "__main__":
    main()
