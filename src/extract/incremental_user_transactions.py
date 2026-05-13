"""
incremental_user_transactions.py
---------------------------------
Pulls per-user monthly deposit/withdrawal aggregates from Stats.Transazioni.

Stats.Transazioni has ~26K rows/day (vs view_transactions 4M/day) so we can
query it efficiently. Per-user net cashflow is needed for the SocioTopography
FC (Financial Capacity) axis.

Output: one parquet per window with columns:
    userid, month, deposits, withdrawals, net_cashflow, tx_count

Run from the project root:
    python -m src.extract.incremental_user_transactions

Optional:
    --window-start / --window-end   e.g. "2026-01-01" "2026-05-01"
    --update-watermark              advance watermark after bounded run
"""
from __future__ import annotations

import argparse
import pandas as pd
from datetime import datetime, UTC
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

WATERMARK_KEY = "Stats.Transazioni_per_user"
WATERMARK_DB  = WATERMARK_DB_PATH
OUT_DIR       = raw_dir("user_transactions")

# Payment provider types for deposits (2,6,7,8) and withdrawals (4=wd section)
# Using same approach as client's Grafana SQL
DEPOSIT_PROVIDERS    = "2, 6, 7, 8"
WITHDRAWAL_PROVIDERS = "2, 6, 7, 8"


def _parse_window(value: str | None, label: str) -> str | None:
    if not value:
        return None
    raw = value.strip()
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"Invalid {label}: '{value}'") from exc
    if len(raw) == 10:
        parsed = parsed.replace(hour=0, minute=0, second=0)
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def _build_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Per-user transaction aggregates from Stats.Transazioni.")
    p.add_argument("--window-start", dest="window_start")
    p.add_argument("--window-end",   dest="window_end")
    p.add_argument("--update-watermark", action="store_true")
    return p.parse_args()


def main() -> None:
    args  = _build_args()
    ws    = _parse_window(args.window_start, "window-start")
    we    = _parse_window(args.window_end,   "window-end")

    if (ws is None) ^ (we is None):
        raise ValueError("Provide both --window-start and --window-end.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = get_watermark(WATERMARK_DB, WATERMARK_KEY)

    lower = ws or last_value
    upper = we
    print(f"[user_transactions] window: {lower} → {upper or 'now'}")

    date_filter = f'"Data" >= :lower'
    params: dict = {"lower": lower}
    if upper:
        date_filter += ' AND "Data" < :upper'
        params["upper"] = upper

    # Per-user monthly deposits and withdrawals from Stats.Transazioni
    # Uses same IDTipoProvider / IDTipoSezione logic as client's Grafana SQL
    query = text(f"""
        SELECT
            "IDUtente"                    AS userid,
            TO_CHAR("Data", 'YYYY-MM')    AS month,
            SUM(CASE WHEN "IDTipoSezione" = 5 AND "Type" = 1 THEN ABS("Importo") ELSE 0 END)
                - SUM(CASE WHEN "IDTipoSezione" = 5 AND "Type" = 2 THEN ABS("Importo") ELSE 0 END)
                                          AS deposits,
            SUM(CASE WHEN "IDTipoSezione" = 4 AND "Type" = 1 THEN ABS("Importo") ELSE 0 END)
                - SUM(CASE WHEN "IDTipoSezione" = 4 AND "Type" = 2 THEN ABS("Importo") ELSE 0 END)
                                          AS withdrawals,
            COUNT(*)                      AS tx_count
        FROM "Stats"."Transazioni"
        WHERE {date_filter}
          AND "IDTipoProvider" IN ({DEPOSIT_PROVIDERS})
        GROUP BY "IDUtente", TO_CHAR("Data", 'YYYY-MM')
        ORDER BY month, userid
    """)

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params=params)

    print(f"[user_transactions] Rows: {len(df)} | Users: {df['userid'].nunique() if not df.empty else 0}")

    if df.empty:
        print("[user_transactions] No data.")
        return

    df["net_cashflow"] = df["deposits"] - df["withdrawals"]

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    if ws:
        tag  = f"{ws[:10].replace('-','')}_{we[:10].replace('-','')}"  # type: ignore[index]
        fname = f"user_transactions_window_{tag}_{ts}.parquet"
    else:
        fname = f"user_transactions_increment_{ts}.parquet"

    out = OUT_DIR / fname
    df.to_parquet(out, index=False)
    print(f"[user_transactions] Saved → {out}")

    if (ws is None) or args.update_watermark:
        set_watermark(WATERMARK_DB, WATERMARK_KEY, str(upper or df["month"].max()))
        print(f"[user_transactions] Watermark updated.")


if __name__ == "__main__":
    main()
