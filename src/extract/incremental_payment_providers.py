"""
incremental_payment_providers.py
----------------------------------
Pulls daily deposit/withdrawal totals grouped by payment provider
from Dwh_en.view_transactions (same source as the main KPI pipeline)
joined with Dwh.Causali for provider names.

Output: one parquet per run in data/raw/payment_providers/ with columns:
    date, reasonid, causale_name, group_name, total_amount, tx_count

Run from project root:
    python -m src.extract.incremental_payment_providers
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, UTC
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from src.app_config import raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

CHUNK_DAYS = 30  # Stats.Transazioni is fast — 30d chunks are fine

WATERMARK_KEY = "payment_providers"
WATERMARK_DB  = Path.home() / "watermarks_payment_providers.db"
OUT_DIR       = raw_dir("payment_providers")

# Must match incremental_transactions_simple.py exactly.
DEPOSIT_REASON_IDS           = "248,249,250,830,835,839,843,851,853,855,857,859,861,863,865,867,869,871,873,875,877,939"
WITHDRAWAL_REASON_IDS        = "251,252,253,254,831,833,837,841,845,847,849"
CANCEL_WITHDRAWAL_REASON_IDS = "838,842,846,848,850"


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
    p.add_argument("--chunk-days", dest="chunk_days", type=int, default=CHUNK_DAYS,
                   help="Max days per query chunk (default: %(default)s)")
    return p.parse_args()


def main() -> None:
    args = _build_args()
    ws   = _parse_window(args.window_start, "window-start")
    we   = _parse_window(args.window_end,   "window-end")

    if (ws is None) ^ (we is None):
        raise ValueError("Provide both --window-start and --window-end.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = get_watermark(WATERMARK_DB, WATERMARK_KEY)

    chunk_days = args.chunk_days
    lower_dt = datetime.fromisoformat(ws or last_value)
    upper_dt = datetime.fromisoformat(we) if we else datetime.now(UTC).replace(tzinfo=None)
    print(f"[payment_providers] window: {lower_dt} → {upper_dt}  (chunk={chunk_days}d)")

    # Uses Stats.Transazioni (fast ~26K rows/day) filtered to the player-credit
    # leg only via IDTipoImportoTransazione:
    #   1 = credit to player wallet  → deposits & cancel-withdrawals
    #   2 = debit from player wallet → withdrawals
    # Without this filter, Stats.Transazioni includes all accounting legs
    # (player + house + settlement) causing ~4x amount inflation.
    query = text(f"""
        SELECT
            CAST(t."Data" AS DATE)  AS date,
            t."IDCausale"           AS reasonid,
            c.Causale               AS causale_name,
            CASE
                WHEN t."IDCausale" IN ({DEPOSIT_REASON_IDS})
                     THEN 'Deposit'
                WHEN t."IDCausale" IN ({CANCEL_WITHDRAWAL_REASON_IDS})
                     THEN 'CancelWithdrawal'
                ELSE 'Withdrawal'
            END                     AS group_name,
            SUM(ABS(t."Importo"))   AS total_amount,
            COUNT(*)                AS tx_count
        FROM "Stats"."Transazioni" t
        JOIN Dwh.Causali c ON t."IDCausale" = c.IDCausale
        WHERE t."Data" >= :lower AND t."Data" < :upper
          AND t."IDStatoGestioneTransazione" = 3
          AND t."IDUtente" NOT IN (
              SELECT userid FROM Dwh_en.view_users WHERE testuser = 1
          )
          AND (
              (t."IDCausale" IN ({DEPOSIT_REASON_IDS})
               AND t."IDTipoImportoTransazione" = 1)
           OR (t."IDCausale" IN ({WITHDRAWAL_REASON_IDS})
               AND t."IDTipoImportoTransazione" = 2)
           OR (t."IDCausale" IN ({CANCEL_WITHDRAWAL_REASON_IDS})
               AND t."IDTipoImportoTransazione" = 1)
          )
        GROUP BY CAST(t."Data" AS DATE), t."IDCausale", c.Causale,
                 CASE
                     WHEN t."IDCausale" IN ({DEPOSIT_REASON_IDS})
                          THEN 'Deposit'
                     WHEN t."IDCausale" IN ({CANCEL_WITHDRAWAL_REASON_IDS})
                          THEN 'CancelWithdrawal'
                     ELSE 'Withdrawal'
                 END
        ORDER BY date, t."IDCausale"
    """)

    engine  = build_engine()
    chunks  = []
    cursor  = lower_dt
    while cursor < upper_dt:
        chunk_end = min(cursor + timedelta(days=chunk_days), upper_dt)
        print(f"[payment_providers] chunk {cursor.date()} → {chunk_end.date()} …", end=" ", flush=True)
        with engine.connect() as conn:
            chunk_df = pd.read_sql(query, conn, params={
                "lower": cursor.strftime("%Y-%m-%d %H:%M:%S"),
                "upper": chunk_end.strftime("%Y-%m-%d %H:%M:%S"),
            })
        print(f"{len(chunk_df)} rows")
        if not chunk_df.empty:
            chunks.append(chunk_df)
        cursor = chunk_end

    if not chunks:
        print("[payment_providers] No data.")
        return

    df = pd.concat(chunks, ignore_index=True)
    df["date"]         = pd.to_datetime(df["date"]).dt.date.astype(str)
    df["total_amount"] = df["total_amount"].astype(float)
    df["tx_count"]     = df["tx_count"].astype(int)

    print(f"[payment_providers] Total rows: {len(df)}")

    ts    = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    fname = f"providers_increment_{ts}.parquet" if not ws else \
            f"providers_window_{ws[:10].replace('-','')}_{we[:10].replace('-','')}_{ts}.parquet"  # type: ignore[index]

    out = OUT_DIR / fname
    df.to_parquet(out, index=False)
    print(f"[payment_providers] Saved → {out}")
    print(df.groupby("group_name")["total_amount"].sum())

    if (ws is None) or args.update_watermark:
        set_watermark(WATERMARK_DB, WATERMARK_KEY, str(upper_dt.strftime("%Y-%m-%d %H:%M:%S")))
        print("[payment_providers] Watermark updated.")


if __name__ == "__main__":
    main()
