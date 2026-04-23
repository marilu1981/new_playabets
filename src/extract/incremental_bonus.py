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

import argparse
import pandas as pd
from datetime import datetime, UTC
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

BONUSES_VIEW   = "Dwh_en.view_bonusbonuses"
CAMPAIGNS_VIEW = "Dwh_en.view_bonuscampaigns"
FREEBETS_VIEW  = "Dwh_en.view_bonusfreebets"
CURSOR_COLUMN  = "DateVersion"
FREEBETS_START_DATE = "2025-11-01 00:00:00"

BONUSES_COLUMNS = [
    "BonusID", "UserID", "CampaignID", "Amount", "CurrencyID",
    "CurrencyExchangeID", "BonusStatusID", "BonusStatus",
    "CalculationBaseAmount", "InsertDate", "Manual",
    "ExpiryDate", "MasterCampaignId", "DateVersion",
    "CancellationBonusTransazionID",   # NULL = original; NOT NULL = reversal record
]
CAMPAIGNS_COLUMNS = [
    "CampaignID", "BonusTypeID", "BonusType",
    "WithdrawalTypeID", "WithdrawalType", "CampaignStatusID",
    "CampaignStatus", "Name", "Code", "InsertDate",
    "ValidityStartDate", "ValidityEndDate", "ManualBonusEnabled",
    "AutomaticBalanceTransfer", "AutomaticBonusCredit", "MasterCampaignID",
]
FREEBETS_COLUMNS = [
    "FreeBetID", "UserID", "CampaignID", "InsertDate", "Amount",
    "FreeBetStatusId", "FreeBetStatus", "ExpiryDate", "CreationCouponId",
]

WATERMARK_DB = WATERMARK_DB_PATH
OUT_DIR = raw_dir("bonus")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract bonus datasets from DWH.")
    parser.add_argument("--window-start", help="Inclusive lower bound for BonusBonuses DateVersion.")
    parser.add_argument("--window-end", help="Exclusive upper bound for BonusBonuses DateVersion.")
    parser.add_argument(
        "--update-watermark",
        action="store_true",
        help="Update the BonusBonuses watermark after a bounded window run.",
    )
    parser.add_argument(
        "--freebets-start",
        default=FREEBETS_START_DATE,
        help="Inclusive lower bound for BonusFreebets InsertDate.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    engine = build_engine()
    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")

    # ── 1. BonusBonuses (incremental) ────────────────────────────────────────
    cols_sql = ", ".join(BONUSES_COLUMNS)
    window_start = args.window_start
    window_end = args.window_end

    if bool(window_start) != bool(window_end):
        raise SystemExit("Use both --window-start and --window-end together.")

    if window_start and window_end:
        print(f"[bonus] Running bounded window: {window_start} <= {CURSOR_COLUMN} < {window_end}")
        last_value = get_watermark(WATERMARK_DB, BONUSES_VIEW)
        print(f"[bonus] Stored watermark remains: {last_value}")
        query = text(
            f"""
            SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql}
            FROM {BONUSES_VIEW}
            WHERE {CURSOR_COLUMN} >= :window_start
              AND {CURSOR_COLUMN} < :window_end
              AND UserID NOT IN (SELECT userid FROM Dwh_en.view_users WHERE testuser = 1)
            """
        )
        bonuses_params = {"window_start": window_start, "window_end": window_end}
        file_window_start = window_start.replace("-", "").replace(":", "").replace(" ", "_")
        file_window_end = window_end.replace("-", "").replace(":", "").replace(" ", "_")
        bonuses_filename = f"bonuses_increment_window_{file_window_start}_{file_window_end}_{ts}.parquet"
    else:
        last_value = get_watermark(WATERMARK_DB, BONUSES_VIEW)
        print(f"[bonus] BonusBonuses watermark: {last_value}")
        query = text(
            f"SELECT {CURSOR_COLUMN} AS __cursor__, {cols_sql} "
            f"FROM {BONUSES_VIEW} WHERE {CURSOR_COLUMN} > :last_value"
            f" AND UserID NOT IN (SELECT userid FROM Dwh_en.view_users WHERE testuser = 1)"
        )
        bonuses_params = {"last_value": last_value}
        bonuses_filename = f"bonuses_increment_{ts}.parquet"

    with engine.connect() as conn:
        df_bonuses = pd.read_sql(query, conn, params=bonuses_params)
    print(f"[bonus] BonusBonuses rows: {len(df_bonuses)}")
    if not df_bonuses.empty:
        out_path = OUT_DIR / bonuses_filename
        df_bonuses.to_parquet(out_path, index=False)
        print(f"[bonus] Saved to {out_path}")
        if window_start and window_end:
            if args.update_watermark:
                set_watermark(WATERMARK_DB, BONUSES_VIEW, str(df_bonuses["__cursor__"].max()))
                print(f"[bonus] Updated watermark to: {df_bonuses['__cursor__'].max()}")
            else:
                print(f"[bonus] Watermark unchanged: {last_value}")
        else:
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
    print("[bonus] Pulling BonusFreebets...")
    cols_sql = ", ".join(FREEBETS_COLUMNS)
    freebets_query = text(
        f"""
        SELECT {cols_sql}
        FROM {FREEBETS_VIEW}
        WHERE InsertDate >= :start_date
        """
    )
    with engine.connect() as conn:
        df_freebets = pd.read_sql(freebets_query, conn, params={"start_date": args.freebets_start})
    print(f"[bonus] BonusFreebets rows: {len(df_freebets)}")
    df_freebets.to_parquet(OUT_DIR / "freebets_latest.parquet", index=False)

    print(f"[bonus] Done. Files written to {OUT_DIR}")


if __name__ == "__main__":
    main()
