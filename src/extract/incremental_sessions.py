"""
incremental_sessions.py
-----------------------
Pulls users' sessions from Dwh_en.view_UserSessions incrementally via LoginDate.

This extract is intentionally login-centric: for RFM and DAU-style use cases the
important event is the session start, so using LoginDate as the watermark keeps
the export smaller and avoids needing full history rewrites when logout/activity
fields change later.

Run from the project root:
    python -m src.extract.incremental_sessions
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME = "Dwh_en.view_usersessions"
CURSOR_COLUMN = "LoginDate"

SELECT_COLUMNS = [
    "SessionId AS sessionid",
    "UserId AS userid",
    "Uid AS uid",
    "LoginDate AS logindate",
    "LogoutDate AS logoutdate",
    "LastActivityDate AS lastactivitydate",
    "SessionStateId AS sessionstateid",
    "SessionState AS sessionstate",
    "DomainName AS domainname",
    "ApplicationTypeId AS applicationtypeid",
    "ApplicationType AS applicationtype",
    "Url AS url",
    "Timeout AS timeout",
    "IsReadOnly AS isreadonly",
]

WATERMARK_DB = WATERMARK_DB_PATH
OUT_DIR = raw_dir("sessions")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    last_value = get_watermark(WATERMARK_DB, VIEW_NAME)
    print(f"[sessions] Current watermark: {last_value}")

    cols_sql = ", ".join(SELECT_COLUMNS)
    query = text(
        f"""
        SELECT
            {CURSOR_COLUMN} AS __cursor__,
            {cols_sql}
        FROM {VIEW_NAME}
        WHERE {CURSOR_COLUMN} > :last_value
          AND {CURSOR_COLUMN} IS NOT NULL
        ORDER BY {CURSOR_COLUMN}
        """
    )

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params={"last_value": last_value})

    print(f"[sessions] Rows pulled: {len(df)}")
    if df.empty:
        print("[sessions] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"sessions_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[sessions] Saved to {out_file}")

    new_watermark = str(df["__cursor__"].max())
    set_watermark(WATERMARK_DB, VIEW_NAME, new_watermark)
    print(f"[sessions] Updated watermark to: {new_watermark}")


if __name__ == "__main__":
    main()
