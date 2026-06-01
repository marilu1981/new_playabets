"""
incremental_user_transactions.py
---------------------------------
Pulls per-user monthly deposit/withdrawal aggregates from Stats.Transazioni.

Stats.Transazioni has ~26K rows/day (vs view_transactions 4M/day) so we can
query it efficiently. Per-user net cashflow is needed for the SocioTopography
FC (Financial Capacity) axis.

Output: one parquet per calendar month, named user_transactions_month_YYYYMM.parquet
    Columns: userid, month, deposits, withdrawals, net_cashflow, tx_count

Chunking: processes one calendar month at a time to avoid SQL Server numeric
overflow when SUM(ABS(Importo)) accumulates across a large window.
Each month file is overwritten on reprocessing — no duplicates.

Run from the project root:
    python -m src.extract.incremental_user_transactions

Optional:
    --window-start / --window-end   e.g. "2026-01-01" "2026-05-01"
    --update-watermark              advance watermark after bounded run
"""
from __future__ import annotations

import argparse
import calendar
from datetime import date, datetime, timedelta, UTC

import pandas as pd
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

WATERMARK_KEY = "Stats.Transazioni_per_user"
WATERMARK_DB  = WATERMARK_DB_PATH
OUT_DIR       = raw_dir("user_transactions")

DEPOSIT_REASON_IDS    = "249,250,830,835,839,843,851,853,855,857,859,861,863,865,867,869,871,877,939"
WITHDRAWAL_REASON_IDS = "251,252,253,254,831,833,837,841,845,847,849,873,875"
CANCEL_WD_REASON_IDS  = "838,842,846,848,850"


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


def _month_chunks(from_date: date, to_date: date) -> list[tuple[date, date]]:
    """Return list of (month_start, next_month_start) pairs covering from_date..to_date."""
    chunks = []
    cur = from_date.replace(day=1)
    while cur <= to_date:
        last_day = calendar.monthrange(cur.year, cur.month)[1]
        next_month = (cur.replace(day=last_day) + timedelta(days=1)).replace(day=1)
        chunks.append((cur, next_month))
        cur = next_month
    return chunks


def _query_month(conn, month_start: date, month_end: date) -> pd.DataFrame:
    """Query one calendar month. Uses CAST(... AS DECIMAL(38,4)) to prevent
    numeric overflow on SQL Server when Importo is a small decimal type."""
    lower = str(month_start) + " 00:00:00"
    upper = str(month_end)   + " 00:00:00"
    query = text(f"""
        SELECT
            "IDUtente"                             AS userid,
            FORMAT("Data", 'yyyy-MM')              AS month,
            SUM(CASE WHEN "IDTipoImportoTransazione" = 1
                      AND "IDCausale" IN ({DEPOSIT_REASON_IDS})
                      AND "IDStatoGestioneTransazione" = 3
                 THEN CAST(ABS("Importo") AS DECIMAL(38,4)) ELSE 0.0 END)   AS deposits,
            SUM(CASE WHEN "IDTipoImportoTransazione" = 2
                      AND "IDCausale" IN ({WITHDRAWAL_REASON_IDS})
                      AND "IDStatoGestioneTransazione" = 3
                 THEN CAST(ABS("Importo") AS DECIMAL(38,4)) ELSE 0.0 END)
                - SUM(CASE WHEN "IDCausale" IN ({CANCEL_WD_REASON_IDS})
                            AND "IDStatoGestioneTransazione" = 3
                       THEN CAST(ABS("Importo") AS DECIMAL(38,4)) ELSE 0.0 END)
                                                   AS withdrawals,
            COUNT(*)                               AS tx_count
        FROM "Stats"."Transazioni"
        WHERE "Data" >= :lower AND "Data" < :upper
        GROUP BY "IDUtente", FORMAT("Data", 'yyyy-MM')
        ORDER BY month, userid
    """)
    df = pd.read_sql(query, conn, params={"lower": lower, "upper": upper})
    return df


def main() -> None:
    args = _build_args()
    ws   = _parse_window(args.window_start, "window-start")
    we   = _parse_window(args.window_end,   "window-end")

    if (ws is None) ^ (we is None):
        raise ValueError("Provide both --window-start and --window-end.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = get_watermark(WATERMARK_DB, WATERMARK_KEY)

    lower_str = ws or last_value
    # Legacy: watermark stored as "YYYY-MM" month-only
    if lower_str and len(lower_str) == 7:
        lower_str = lower_str + "-01 00:00:00"

    if not lower_str:
        raise ValueError("No watermark found — provide --window-start to bootstrap.")

    from_date = date.fromisoformat(lower_str[:10])
    to_date   = date.fromisoformat(we[:10]) if we else date.today()

    chunks = _month_chunks(from_date, to_date)
    print(f"[user_transactions] {len(chunks)} monthly chunk(s): {from_date} → {to_date}")

    engine = build_engine()
    last_written: date | None = None

    for month_start, month_end in chunks:
        tag = month_start.strftime("%Y%m")
        print(f"[user_transactions] Chunk {tag}: {month_start} → {month_end}")

        with engine.connect() as conn:
            df = _query_month(conn, month_start, month_end)

        if df.empty:
            print(f"[user_transactions] No data for {tag} — skipping.")
            last_written = month_start
            continue

        df["net_cashflow"] = df["deposits"] - df["withdrawals"]
        print(f"[user_transactions] {tag}: {len(df)} rows, {df['userid'].nunique()} users")

        # One file per month — overwrite so reprocessing never duplicates
        out = OUT_DIR / f"user_transactions_month_{tag}.parquet"
        df.to_parquet(out, index=False)
        print(f"[user_transactions] Saved → {out}")
        last_written = month_start

    if last_written and ((ws is None) or args.update_watermark):
        new_wm = str(to_date)
        set_watermark(WATERMARK_DB, WATERMARK_KEY, new_wm)
        print(f"[user_transactions] Watermark updated to {new_wm}")


if __name__ == "__main__":
    main()
