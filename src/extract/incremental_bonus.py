"""
incremental_bonus.py
---------------------
Pulls bonus data from three views:
  - Dwh_en.view_BonusBonuses    (incremental via DateVersion)
  - Dwh_en.view_BonusCampaigns  (full-refresh)
  - Dwh_en.view_BonusFreebets   (full-refresh)

Run from the project root:
    python -m src.extract.incremental_bonus
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from sqlalchemy import text

from src.extract.db_utils import build_engine, get_watermark, set_watermark

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


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    engine = build_engine()
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")

    # ── 1. BonusBonuses (incremental) ────────────────────────────────────────
    last_value = get_watermark(WATERMARK_DB, BONUSES_VIEW)
    print(f"[bonus] BonusBonuses watermark: {last_value}")
    cols_sql = ", ".join(BONUSES_COLUMNS)
    query = text(
        f"SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql} "
        f"FROM {BONUSES_VIEW} WHERE {CURSOR_COLUMN} > :last_value"
    )
    with engine.connect() as conn:
        df_bonuses = pd.read_sql(query, conn, params={"last_value": last_value})
    print(f"[bonus] BonusBonuses rows: {len(df_bonuses)}")
    if not df_bonuses.empty:
        df_bonuses.to_parquet(OUT_DIR / f"bonuses_increment_{ts}.parquet", index=False)
        set_watermark(WATERMARK_DB, BONUSES_VIEW, str(df_bonuses["__cursor__"].max()))
        print(f"[bonus] Watermark updated to: {df_bonuses['__cursor__'].max()}")

    # ── 2. BonusCampaigns (full-refresh) ─────────────────────────────────────
    print("[bonus] Pulling BonusCampaigns (full-refresh)...")
    cols_sql = ", ".join(CAMPAIGNS_COLUMNS)
    with engine.connect() as conn:
        df_campaigns = pd.read_sql(text(f"SELECT {cols_sql} FROM {CAMPAIGNS_VIEW}"), conn)
    print(f"[bonus] BonusCampaigns rows: {len(df_campaigns)}")
    df_campaigns.to_parquet(OUT_DIR / "campaigns_latest.parquet", index=False)

    # ── 3. BonusFreebets (full-refresh) ──────────────────────────────────────
    print("[bonus] Pulling BonusFreebets (full-refresh)...")
    cols_sql = ", ".join(FREEBETS_COLUMNS)
    with engine.connect() as conn:
        df_freebets = pd.read_sql(text(f"SELECT {cols_sql} FROM {FREEBETS_VIEW}"), conn)
    print(f"[bonus] BonusFreebets rows: {len(df_freebets)}")
    df_freebets.to_parquet(OUT_DIR / "freebets_latest.parquet", index=False)

    print(f"[bonus] Done. Files written to {OUT_DIR}")


if __name__ == "__main__":
    main()
