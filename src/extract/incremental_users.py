"""
incremental_users.py
---------------------
Pulls new/updated rows from Dwh_en.view_users incrementally via DateVersion.
Also enriches each exported user row with current balance fields from
Dwh_en.view_balances.

Run from the project root:
    python -m src.extract.incremental_users

Environment variables required:
    DWH_USER  - SQL Server login
    DWH_PASS  - SQL Server password
"""
from __future__ import annotations

import argparse
import os
import pandas as pd
from datetime import datetime, UTC
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME = "Dwh_en.view_users"
BALANCES_VIEW = "Dwh_en.view_balances"
CURSOR_COLUMN = "DateVersion"

# Keep stable, lowercase output column names for downstream transforms.
ADDITIONAL_DATA_VIEW = "Dwh_en.view_UserAdditionalData"

SELECT_COLUMNS = [
    "u.userid AS userid",
    "u.bookmakerid AS bookmakerid",
    "u.bookmaker AS bookmaker",
    "u.parentid AS parentid",
    "u.username AS username",
    "u.name AS name",
    "u.surname AS surname",
    "u.userstatus AS userstatus",
    "u.testuser AS testuser",
    "u.usertypeid AS usertypeid",
    "u.usertype AS usertype",
    "u.currencyid AS currencyid",
    "u.currency AS currency",
    "u.cashier AS cashier",
    "u.userprofileid AS userprofileid",
    "u.userprofile AS userprofile",
    "u.lastlogin AS lastlogin",
    "u.province AS province",
    "u.countryid AS countryid",
    "u.country AS country",
    "u.city AS city",
    "u.zipcode AS zipcode",
    "u.birthdate AS birthdate",
    "u.creationdate AS creationdate",
    "u.dateversion AS dateversion",
    "u.detaildateversion AS detaildateversion",
    "b.balance AS balance",
    "b.credit AS credit",
    "b.lasttransactiondate AS lasttransactiondate",
    "aff.Value AS affiliate_tag",
    "promo.Value AS promo_code",
]

WATERMARK_DB = os.environ.get("WATERMARK_DB_PATH", str(WATERMARK_DB_PATH))
OUT_DIR = raw_dir("users")


def _parse_window_value(value: str | None, *, label: str) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(
            f"Invalid {label} value '{value}'. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS."
        ) from exc
    if len(raw) == 10:
        parsed = parsed.replace(hour=0, minute=0, second=0, microsecond=0)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def _build_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Incremental users extract with optional DateVersion window."
    )
    parser.add_argument(
        "--window-start",
        dest="window_start",
        help="Inclusive DateVersion lower bound for a bounded backfill window.",
    )
    parser.add_argument(
        "--window-end",
        dest="window_end",
        help="Exclusive DateVersion upper bound for a bounded backfill window.",
    )
    parser.add_argument(
        "--update-watermark",
        action="store_true",
        help="Advance the stored watermark after a bounded window run.",
    )
    return parser.parse_args()


def _resolve_window(args: argparse.Namespace) -> tuple[str | None, str | None]:
    window_start = _parse_window_value(args.window_start, label="window-start")
    window_end = _parse_window_value(args.window_end, label="window-end")
    if (window_start is None) ^ (window_end is None):
        raise ValueError("Provide both --window-start and --window-end together for chunked exports.")
    if window_start and window_end and window_start >= window_end:
        raise ValueError("--window-start must be earlier than --window-end.")
    return window_start, window_end


def _window_suffix(window_start: str | None, window_end: str | None) -> str:
    if not window_start or not window_end:
        return ""
    start_tag = window_start[:10].replace("-", "")
    end_tag = window_end[:10].replace("-", "")
    return f"_window_{start_tag}_{end_tag}"


def main() -> None:
    args = _build_args()
    window_start, window_end = _resolve_window(args)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    last_value = get_watermark(WATERMARK_DB, VIEW_NAME)
    lower_bound = window_start or last_value
    if window_start and window_end:
        print(f"[users] Running bounded window: {window_start} <= DateVersion < {window_end}")
        print(f"[users] Stored watermark remains: {last_value}")
    else:
        print(f"[users] Current watermark: {last_value}")

    cols_sql = ", ".join(SELECT_COLUMNS)
    if window_start and window_end:
        query = text(
            f"""
            SELECT
                u.{CURSOR_COLUMN} AS __cursor__,
                {cols_sql}
            FROM {VIEW_NAME} u
            LEFT JOIN {BALANCES_VIEW} b
                ON b.UserID = u.UserID
            LEFT JOIN {ADDITIONAL_DATA_VIEW} aff
                ON aff.UserID = u.UserID AND aff.UserAdditionalDataTypeID = 170
            LEFT JOIN {ADDITIONAL_DATA_VIEW} promo
                ON promo.UserID = u.UserID AND promo.UserAdditionalDataTypeID = 173
            WHERE u.{CURSOR_COLUMN} >= :window_start
              AND u.{CURSOR_COLUMN} < :window_end
            """
        )
        params = {"window_start": window_start, "window_end": window_end}
    else:
        query = text(
            f"""
            SELECT
                u.{CURSOR_COLUMN} AS __cursor__,
                {cols_sql}
            FROM {VIEW_NAME} u
            LEFT JOIN {BALANCES_VIEW} b
                ON b.UserID = u.UserID
            LEFT JOIN {ADDITIONAL_DATA_VIEW} aff
                ON aff.UserID = u.UserID AND aff.UserAdditionalDataTypeID = 170
            LEFT JOIN {ADDITIONAL_DATA_VIEW} promo
                ON promo.UserID = u.UserID AND promo.UserAdditionalDataTypeID = 173
            WHERE u.{CURSOR_COLUMN} > :last_value
            """
        )
        params = {"last_value": lower_bound}

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params=params)

    print(f"[users] Rows pulled: {len(df)}")
    if df.empty:
        print("[users] No new data.")
        return

    creation_col = next((c for c in df.columns if c.lower() == "creationdate"), None)
    if creation_col:
        creation_dt = pd.to_datetime(df[creation_col], errors="coerce")
        print(
            "[users] creationdate non-null=%d, min=%s, max=%s"
            % (
                int(creation_dt.notna().sum()),
                str(creation_dt.min()),
                str(creation_dt.max()),
            )
        )

    user_col = next((c for c in df.columns if c.lower() == "userid"), None)
    if user_col:
        print(f"[users] unique userids in batch: {int(df[user_col].nunique(dropna=True))}")

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"users_increment{_window_suffix(window_start, window_end)}_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[users] Saved to {out_file}")

    new_watermark = str(df["__cursor__"].max())
    should_update_watermark = window_start is None or args.update_watermark
    if should_update_watermark:
        set_watermark(WATERMARK_DB, VIEW_NAME, new_watermark)
        print(f"[users] Updated watermark to: {new_watermark}")
    else:
        print(f"[users] Window run complete. Watermark left unchanged at: {last_value}")


if __name__ == "__main__":
    main()
