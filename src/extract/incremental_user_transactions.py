"""
incremental_user_transactions.py
---------------------------------
Pulls per-user deposit and withdrawal rows from Dwh_en.view_transactions
incrementally via DateVersion.

Unlike the platform-level transactions aggregate, this extract keeps UserID so
the SocioTopography model can compute rolling per-user financial capacity (FC axis).

Output columns:
    userid, date, amount, transaction_amount_type, reason, reason_group,
    balance_after, dateversion

Only includes real, non-cashier users and filters to meaningful transaction
types (deposit/withdrawal group + stake/winnings credits).

Run from the project root:
    python -m src.extract.incremental_user_transactions

Environment variables:
    DWH_USER  – SQL Server login
    DWH_PASS  – SQL Server password

Optional:
    INITIAL_LOAD_DAYS   – days to look back on first run (default: 90)
"""
from __future__ import annotations

import argparse
import pandas as pd
from datetime import datetime, UTC
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME     = "Dwh_en.view_transactions"
CURSOR_COLUMN = "DateVersion"
WATERMARK_KEY = "Dwh_en.view_transactions_per_user"   # separate key from platform aggregate

WATERMARK_DB = WATERMARK_DB_PATH
OUT_DIR = raw_dir("user_transactions")

# Only pull transaction reason groups relevant to the model:
#   2 = DepositWithdrawal  (cash in / cash out)
#   Any NULL reason group is also kept so we don't silently drop stake credits
REASON_GROUP_FILTER = (2,)

COLUMNS = [
    "T.UserID            AS userid",
    "CAST(T.Date AS DATE) AS date",
    "T.Amount            AS amount",
    "T.TransactionAmountType AS transaction_amount_type",
    "R.Reason            AS reason",
    "R.ReasonGroup       AS reason_group",
    "T.BalanceAtLastTransaction AS balance_after",
    "T.DateVersion       AS dateversion",
]


def _parse_window(value: str | None, label: str) -> str | None:
    if not value:
        return None
    raw = value.strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"Invalid {label} value '{value}'. Use YYYY-MM-DD.") from exc
    if len(raw) == 10:
        parsed = parsed.replace(hour=0, minute=0, second=0)
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def _build_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Incremental per-user transactions extract."
    )
    p.add_argument("--window-start", dest="window_start",
                   help="Inclusive DateVersion lower bound for a backfill window.")
    p.add_argument("--window-end", dest="window_end",
                   help="Exclusive DateVersion upper bound for a backfill window.")
    p.add_argument("--update-watermark", action="store_true",
                   help="Advance the stored watermark after a bounded window run.")
    return p.parse_args()


def main() -> None:
    args = _build_args()
    window_start = _parse_window(args.window_start, "window-start")
    window_end   = _parse_window(args.window_end,   "window-end")

    if (window_start is None) ^ (window_end is None):
        raise ValueError("Provide both --window-start and --window-end together.")
    if window_start and window_end and window_start >= window_end:
        raise ValueError("--window-start must be earlier than --window-end.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = get_watermark(WATERMARK_DB, WATERMARK_KEY)

    if window_start:
        lower = window_start
        print(f"[user_transactions] Bounded window: {window_start} -> {window_end}")
        print(f"[user_transactions] Stored watermark unchanged: {last_value}")
    else:
        lower = last_value
        print(f"[user_transactions] Incremental from watermark: {lower}")

    cols_sql = ",\n    ".join(COLUMNS)
    reason_placeholders = ", ".join(f":rg{i}" for i in range(len(REASON_GROUP_FILTER)))

    if window_start and window_end:
        where_cursor = (
            f"T.{CURSOR_COLUMN} >= :lower AND T.{CURSOR_COLUMN} < :upper"
        )
        params: dict = {"lower": lower, "upper": window_end}
    else:
        where_cursor = f"T.{CURSOR_COLUMN} > :lower"
        params = {"lower": lower}

    for i, rg in enumerate(REASON_GROUP_FILTER):
        params[f"rg{i}"] = rg

    query = text(f"""
        SELECT
            {cols_sql}
        FROM {VIEW_NAME} T
        INNER JOIN Dwh_en.view_Reasons R
            ON T.ReasonID = R.ReasonID
        INNER JOIN Dwh_en.view_Users U
            ON T.UserID = U.UserID
        WHERE {where_cursor}
          AND R.ReasonGroupID IN ({reason_placeholders})
          AND U.TestUser  = 0
          AND U.Cashier   = 0
          AND U.UserTypeID = 0
          AND T.TransactionManagementStatusID IN (1, 3)  -- System + Accepted only
    """)

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params=params)

    print(f"[user_transactions] Rows pulled: {len(df)}")

    if df.empty:
        print("[user_transactions] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    if window_start:
        start_tag = window_start[:10].replace("-", "")
        end_tag   = window_end[:10].replace("-", "")  # type: ignore[index]
        fname = f"user_transactions_window_{start_tag}_{end_tag}_{ts}.parquet"
    else:
        fname = f"user_transactions_increment_{ts}.parquet"

    out_file = OUT_DIR / fname
    df.to_parquet(out_file, index=False)
    print(f"[user_transactions] Saved → {out_file}")

    new_watermark = str(df["dateversion"].max())
    should_update = (window_start is None) or args.update_watermark
    if should_update:
        set_watermark(WATERMARK_DB, WATERMARK_KEY, new_watermark)
        print(f"[user_transactions] Watermark updated → {new_watermark}")
    else:
        print(f"[user_transactions] Window run complete. Watermark left at: {last_value}")


if __name__ == "__main__":
    main()
