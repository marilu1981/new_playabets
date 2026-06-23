"""
incremental_first_deposits.py
-----------------------------
Pulls per-user first deposit date from Stats.Transazioni_DepositiUtente.

The source table has one row per (user, causale/payment-method). We take the
MIN(dataprimodeposito) per user so that each user is counted only once,
using their globally earliest deposit date across all payment methods.

This is a FULL refresh (no watermark): the result set is small (one row per
ever-depositing user) and the logic requires the historical minimum.

Run from the project root:
    python -m src.extract.incremental_first_deposits

Environment variables required:
    DWH_USER
    DWH_PASS
"""
from __future__ import annotations

import pandas as pd
from datetime import datetime, UTC
from sqlalchemy import text

from src.app_config import raw_dir
from src.extract.db_utils import build_engine

VIEW_NAME = "Stats.Transazioni_DepositiUtente"

OUT_DIR = raw_dir("first_deposits")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # One row per user: their globally first deposit date and amount.
    # Join to Stats.transazioni on the idprimodeposito to get the Importo amount.
    # Exclude test users.
    query = text(
        f"""
        SELECT
            d.idutente,
            MIN(d.dataprimodeposito) AS dataprimodeposito,
            SUM(CASE
                WHEN d.dataprimodeposito = (
                    SELECT MIN(d2.dataprimodeposito)
                    FROM {VIEW_NAME} d2
                    WHERE d2.idutente = d.idutente
                ) THEN CAST(t.Importo AS FLOAT)
                ELSE 0
            END) AS first_deposit_amount
        FROM {VIEW_NAME} d
        LEFT JOIN Stats.transazioni t
          ON t.IDUtente = d.idutente
         AND CAST(t.Data AS DATE) = CAST(d.dataprimodeposito AS DATE)
         AND t.IDCausale = d.idcausale
         AND t.IDTipoImportoTransazione = 1
         AND t.IDStatoGestioneTransazione = 3
        WHERE d.dataprimodeposito IS NOT NULL
          AND d.idutente NOT IN (
              SELECT userid FROM Dwh_en.view_users WHERE testuser = 1
          )
        GROUP BY d.idutente
        """
    )

    engine = build_engine()
    print(f"[first_deposits] Querying {VIEW_NAME} (full refresh, per-user MIN)…")
    with engine.connect() as conn:
        df = pd.read_sql(query, conn)

    print(f"[first_deposits] Rows pulled: {len(df)}")
    if df.empty:
        print("[first_deposits] No data.")
        return

    ts = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    # Use a fixed filename so the next run overwrites the previous full snapshot.
    out_file = OUT_DIR / "first_deposits_full.parquet"
    df.to_parquet(out_file, index=False)
    print(f"[first_deposits] Saved full snapshot → {out_file}")


if __name__ == "__main__":
    main()
