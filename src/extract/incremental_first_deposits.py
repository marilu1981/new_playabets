"""
incremental_first_deposits.py
-----------------------------
Pulls rows from Stats.Transazioni_DepositiUtente incrementally using dataprimodeposito.

Source columns:
  idutente, idcausale, dataprimodeposito, idprimodeposito, dataultimodeposito, idultimodeposito

Run from the project root:
    python -m src.extract.incremental_first_deposits

Environment variables required:
    DWH_USER
    DWH_PASS
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from pathlib import Path
from sqlalchemy import text

from src.extract.db_utils import build_engine, get_watermark, set_watermark

VIEW_NAME = "Stats.Transazioni_DepositiUtente"
CURSOR_COLUMN = "dataprimodeposito"

COLUMNS = [
    "idutente",
    "idcausale",
    "dataprimodeposito",
    "idprimodeposito",
    "dataultimodeposito",
    "idultimodeposito",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
WATERMARK_DB = PROJECT_ROOT / "data" / "watermarks.db"
OUT_DIR = PROJECT_ROOT / "data" / "raw" / "first_deposits"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    last_value = get_watermark(WATERMARK_DB, VIEW_NAME)
    print(f"[first_deposits] Current watermark: {last_value}")

    cols_sql = ", ".join(COLUMNS)
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

    print(f"[first_deposits] Rows pulled: {len(df)}")
    if df.empty:
        print("[first_deposits] No new data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    out_file = OUT_DIR / f"first_deposits_increment_{ts}.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[first_deposits] Saved to {out_file}")

    new_watermark = str(df["__cursor__"].max())
    set_watermark(WATERMARK_DB, VIEW_NAME, new_watermark)
    print(f"[first_deposits] Updated watermark to: {new_watermark}")


if __name__ == "__main__":
    main()
