"""
incremental_bonus_campaign_performance.py
-----------------------------------------
Builds an aggregate campaign-performance snapshot directly in DWH and exports
one row per campaign instead of raw bonus transaction facts.

The output is intended for campaign tables and KPI-style reporting where raw
BonusTransaction rows would be unnecessarily large.

Run from the project root:
    python -m src.extract.incremental_bonus_campaign_performance
"""
from __future__ import annotations

from datetime import datetime, UTC

import pandas as pd
from sqlalchemy import text

from src.app_config import raw_dir
from src.extract.db_utils import build_engine

OUT_DIR = raw_dir("bonus")

QUERY = text(
    """
    WITH real_users AS (
        SELECT
            u.UserID
        FROM Dwh_en.view_Users u
        WHERE ISNULL(u.TestUser, 0) = 0
          AND ISNULL(u.Cashier, 0) = 0
          AND ISNULL(u.UserTypeID, 0) = 0
    ),
    campaign_users AS (
        SELECT
            buc.CampaignID,
            COUNT(DISTINCT buc.UserID) AS users_enrolled
        FROM Dwh_en.view_BonusUsersCampaigns buc
        INNER JOIN real_users ru
            ON ru.UserID = buc.UserID
        GROUP BY buc.CampaignID
    ),
    bonuses AS (
        SELECT
            bb.CampaignID,
            COUNT(*) AS bonuses_paid_total_count,
            COUNT(DISTINCT bb.UserID) AS credited_users,
            SUM(CAST(bb.Amount AS decimal(19, 4))) AS total_paid
        FROM Dwh_en.view_BonusBonuses bb
        INNER JOIN real_users ru
            ON ru.UserID = bb.UserID
        WHERE bb.BonusStatusID IN (2, 5)
        GROUP BY bb.CampaignID
    ),
    betslips AS (
        SELECT
            bs.BonusCampaignID AS CampaignID,
            COUNT(*) AS total_betslips,
            SUM(CAST(bs.Stake AS decimal(19, 4))) AS total_stake,
            SUM(CAST(bs.Winnings AS decimal(19, 4))) AS total_winnings,
            SUM(CAST(bs.Stake - bs.Winnings AS decimal(19, 4))) AS profit
        FROM Dwh_en.view_Betslips bs
        INNER JOIN real_users ru
            ON ru.UserID = bs.UserID
        WHERE bs.CreditTypeID = 2
          AND bs.BonusCampaignID IS NOT NULL
        GROUP BY bs.BonusCampaignID
    )
    SELECT
        c.CampaignID,
        c.Name,
        c.Code,
        c.CampaignStatusID,
        c.CampaignStatus,
        c.BonusTypeID,
        c.BonusType,
        c.ValidityStartDate,
        c.ValidityEndDate,
        ISNULL(cu.users_enrolled, 0) AS users_enrolled,
        ISNULL(b.bonuses_paid_total_count, 0) AS bonuses_paid_total_count,
        ISNULL(b.credited_users, 0) AS credited_users,
        ISNULL(b.total_paid, 0) AS total_paid,
        ISNULL(s.total_betslips, 0) AS total_betslips,
        ISNULL(s.total_stake, 0) AS total_stake,
        ISNULL(s.total_winnings, 0) AS total_winnings,
        ISNULL(s.profit, 0) AS profit,
        CASE
            WHEN ISNULL(b.total_paid, 0) = 0 THEN NULL
            ELSE CAST((ISNULL(s.profit, 0) / NULLIF(b.total_paid, 0)) * 100.0 AS decimal(19, 4))
        END AS roi
    FROM Dwh_en.view_BonusCampaigns c
    LEFT JOIN campaign_users cu
        ON cu.CampaignID = c.CampaignID
    LEFT JOIN bonuses b
        ON b.CampaignID = c.CampaignID
    LEFT JOIN betslips s
        ON s.CampaignID = c.CampaignID
    """
)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(QUERY, conn)

    print(f"[bonus_campaign_performance] Rows pulled: {len(df)}")
    if df.empty:
        print("[bonus_campaign_performance] No data returned.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    snapshot = OUT_DIR / f"campaign_performance_snapshot_{ts}.parquet"
    latest = OUT_DIR / "campaign_performance_latest.parquet"
    df.to_parquet(snapshot, index=False)
    df.to_parquet(latest, index=False)
    print(f"[bonus_campaign_performance] Saved snapshot to {snapshot}")
    print(f"[bonus_campaign_performance] Updated latest to {latest}")


if __name__ == "__main__":
    main()
