"""
incremental_payment_providers.py
----------------------------------
Pulls daily deposit/withdrawal totals grouped by payment provider
from Dwh_en.view_transactions joined with Dwh.Causali for provider names.

Output: one parquet per run in data/raw/payment_providers/ with columns:
    date, reasonid, causale_name, group_name, total_amount, tx_count

Run from project root:
    python -m src.extract.incremental_payment_providers
"""
from __future__ import annotations

import argparse
from datetime import datetime, UTC
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from src.app_config import raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

WATERMARK_KEY = "payment_providers"
WATERMARK_DB  = Path.home() / "watermarks_payment_providers.db"
OUT_DIR       = raw_dir("payment_providers")


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
    p = argparse.ArgumentParser(description="Daily payment provider deposit/withdrawal extract.")
    p.add_argument("--window-start", dest="window_start")
    p.add_argument("--window-end",   dest="window_end")
    p.add_argument("--update-watermark", action="store_true")
    return p.parse_args()


def main() -> None:
    args = _build_args()
    ws   = _parse_window(args.window_start, "window-start")
    we   = _parse_window(args.window_end,   "window-end")

    if (ws is None) ^ (we is None):
        raise ValueError("Provide both --window-start and --window-end.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = get_watermark(WATERMARK_DB, WATERMARK_KEY)

    lower = ws or last_value
    upper = we
    print(f"[payment_providers] window: {lower} → {upper or 'now'}")

    date_filter = "t.date >= :lower"
    params: dict = {"lower": lower}
    if upper:
        date_filter += " AND t.date < :upper"
        params["upper"] = upper

    query = text(f"""
        SELECT
            CAST(t.date AS DATE)  AS date,
            t.reasonid,
            c.Causale             AS causale_name,
            c.GruppoCausale       AS group_name,
            SUM(t.amount)         AS total_amount,
            COUNT(*)              AS tx_count
        FROM Dwh_en.view_transactions t
        JOIN Dwh.Causali c ON t.reasonid = c.IDCausale
        WHERE {date_filter}
          AND c.GruppoCausale IN ('Deposit', 'Withdrawals')
          AND t.testuser = 0
        GROUP BY CAST(t.date AS DATE), t.reasonid, c.Causale, c.GruppoCausale
        ORDER BY date, t.reasonid
    """)

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params=params)

    print(f"[payment_providers] Rows: {len(df)}")

    if df.empty:
        print("[payment_providers] No data.")
        return

    df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)
    df["total_amount"] = df["total_amount"].astype(float)
    df["tx_count"]     = df["tx_count"].astype(int)

    ts    = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    fname = f"providers_increment_{ts}.parquet" if not ws else \
            f"providers_window_{ws[:10].replace('-','')}_{we[:10].replace('-','')}_{ts}.parquet"  # type: ignore[index]

    out = OUT_DIR / fname
    df.to_parquet(out, index=False)
    print(f"[payment_providers] Saved → {out}")
    print(df.groupby("group_name")["total_amount"].sum())

    if (ws is None) or args.update_watermark:
        set_watermark(WATERMARK_DB, WATERMARK_KEY, str(upper or df["date"].max()))
        print("[payment_providers] Watermark updated.")


if __name__ == "__main__":
    main()
