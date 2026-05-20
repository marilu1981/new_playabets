"""
incremental_taxes.py
---------------------
Pulls daily Taxes Paid from Dwh.CorrelazioneTransazioniDatiAggiuntivi.

The DWH stores betting tax as an "additional data" row correlated to each
settled transaction.  IDTipoDatoAggiuntivoCorrelazioneTransazioni = 38
identifies the tax amount column.

Output: one parquet per run in data/raw/taxes/ with columns:
    date, taxes_paid

Run from project root:
    python -m src.extract.incremental_taxes

Optional:
    --window-start "2026-01-01"  --window-end "2026-05-01"
    --update-watermark
"""
from __future__ import annotations

import argparse
from datetime import datetime, UTC, date as _date
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from src.app_config import WATERMARK_DB_PATH, raw_dir
from src.extract.db_utils import build_engine, get_watermark, set_watermark

WATERMARK_KEY = "taxes_paid"
WATERMARK_DB  = WATERMARK_DB_PATH.parent / "watermarks_taxes.db"
OUT_DIR       = raw_dir("taxes")

# IDTipoDatoAggiuntivoCorrelazioneTransazioni = 38 → Betting Tax
TAX_TYPE_ID = 38

# ── Table/column names to verify on VM ───────────────────────────────────────
# Run to confirm:
#   python3 -c "
#   from src.extract.db_utils import build_engine; from sqlalchemy import text
#   e=build_engine()
#   with e.connect() as c:
#       r=c.execute(text('SELECT TOP 1 * FROM Dwh.CorrelazioneTransazioniDatiAggiuntivi'))
#       print(list(r.keys()))
#   "
TABLE_NAME   = "Dwh.CorrelazioneTransazioniDatiAggiuntivi"
DATE_COL     = "DataCreazione"
AMOUNT_COL   = "Valore"
TYPE_COL     = "IDTipoDatoAggiuntivoCorrelazioneTransazioni"
# ─────────────────────────────────────────────────────────────────────────────


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
    p = argparse.ArgumentParser(description="Daily taxes paid extract.")
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
    print(f"[taxes] window: {lower} → {upper or 'now'}")

    date_filter = f'"{DATE_COL}" >= :lower'
    params: dict = {"lower": lower}
    if upper:
        date_filter += f' AND "{DATE_COL}" < :upper'
        params["upper"] = upper

    query = text(f"""
        SELECT
            CAST("{DATE_COL}" AS DATE)  AS date,
            SUM(ABS("{AMOUNT_COL}"))    AS taxes_paid
        FROM "{TABLE_NAME}"
        WHERE {date_filter}
          AND "{TYPE_COL}" = {TAX_TYPE_ID}
        GROUP BY CAST("{DATE_COL}" AS DATE)
        ORDER BY date
    """)

    engine = build_engine()
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params=params)

    print(f"[taxes] Rows: {len(df)}")

    if df.empty:
        print("[taxes] No data.")
        return

    df["date"] = pd.to_datetime(df["date"]).dt.date.astype(str)

    ts    = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    fname = f"taxes_increment_{ts}.parquet" if not ws else \
            f"taxes_window_{ws[:10].replace('-','')}_{we[:10].replace('-','')}_{ts}.parquet"  # type: ignore[index]

    out = OUT_DIR / fname
    df.to_parquet(out, index=False)
    print(f"[taxes] Saved → {out}")
    print(df.tail())

    if (ws is None) or args.update_watermark:
        set_watermark(WATERMARK_DB, WATERMARK_KEY, str(upper or df["date"].max()))
        print("[taxes] Watermark updated.")


if __name__ == "__main__":
    main()
