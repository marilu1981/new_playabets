"""
ftd_kpis.py
-----------
Transforms first-deposit extract into daily FTD counts.

Input (Stats.Transazioni_DepositiUtente extract):
  idutente, dataprimodeposito, ...

Output:
  date, ftds
"""
from __future__ import annotations

import pandas as pd

from .io_utils import normalize_cols, ensure_cols, to_date, to_dt


def compute_ftd_daily(first_deposits: pd.DataFrame) -> pd.DataFrame:
    if first_deposits.empty:
        return pd.DataFrame(columns=["date", "ftds"])

    df, dcol = normalize_cols(first_deposits)
    cols = ensure_cols(
        dcol,
        required_lower=["idutente", "dataprimodeposito"],
        context="FirstDeposits",
    )

    user_id = cols["idutente"]
    first_dep = cols["dataprimodeposito"]

    # Defensive dedupe in case multiple rows exist per user in source snapshots.
    df["_ftd_dt"] = to_dt(df[first_dep])
    df = df.dropna(subset=["_ftd_dt"]).sort_values("_ftd_dt").drop_duplicates(subset=[user_id], keep="first")
    df["date"] = to_date(df[first_dep])

    out = (
        df.dropna(subset=["date"])
        .groupby("date")[user_id]
        .nunique()
        .rename("ftds")
        .reset_index()
        .sort_values("date")
    )
    out["ftds"] = out["ftds"].astype(int)
    return out
