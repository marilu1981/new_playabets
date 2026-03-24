"""
incremental_bonus_users_campaigns.py
------------------------------------
Pulls the preloaded user list for bonus campaigns from
Dwh_en.view_BonusUsersCampaigns as a full-refresh snapshot.

This is a lower-volume support extract than raw bonus transactions and is
useful for campaign audience sizing without dumping the full bonus transaction
fact table.

Run from the project root:
    python -m src.extract.incremental_bonus_users_campaigns
"""
from __future__ import annotations

from datetime import datetime, UTC

import pandas as pd
from sqlalchemy import text

from src.app_config import raw_dir
from src.extract.db_utils import build_engine

VIEW_NAME = "Dwh_en.view_bonususerscampaigns"
COLUMNS = [
    "CampaignID",
    "UserID",
    "LastModifiedDate",
]

OUT_DIR = raw_dir("bonus")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    cols_sql = ", ".join(COLUMNS)
    query = text(f"SELECT {cols_sql} FROM {VIEW_NAME}")

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    print(f"[bonus_users_campaigns] Rows pulled: {len(df)}")
    if df.empty:
        print("[bonus_users_campaigns] No data returned.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    snapshot = OUT_DIR / f"campaign_users_snapshot_{ts}.parquet"
    latest = OUT_DIR / "campaign_users_latest.parquet"
    df.to_parquet(snapshot, index=False)
    df.to_parquet(latest, index=False)
    print(f"[bonus_users_campaigns] Saved snapshot to {snapshot}")
    print(f"[bonus_users_campaigns] Updated latest to {latest}")


if __name__ == "__main__":
    main()
