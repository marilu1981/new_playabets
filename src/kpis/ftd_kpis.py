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
        return pd.DataFrame(columns=["date", "ftds", "ftd_total_amount"])

    df, dcol = normalize_cols(first_deposits)
    cols = ensure_cols(
        dcol,
        required_lower=["idutente", "dataprimodeposito"],
        context="FirstDeposits",
    )

    user_id = cols["idutente"]
    first_dep = cols["dataprimodeposito"]
    amount_col = dcol.get("first_deposit_amount")

    # Defensive dedupe in case multiple rows exist per user in source snapshots.
    df["_ftd_dt"] = to_dt(df[first_dep])
    df = df.dropna(subset=["_ftd_dt"]).sort_values("_ftd_dt").drop_duplicates(subset=[user_id], keep="first")
    df["date"] = to_date(df[first_dep])

    agg = {"ftds": (user_id, "nunique")}
    if amount_col:
        df["_amount"] = pd.to_numeric(df[amount_col], errors="coerce").fillna(0.0)
        agg["ftd_total_amount"] = ("_amount", "sum")

    out = (
        df.dropna(subset=["date"])
        .groupby("date")
        .agg(**agg)
        .reset_index()
        .sort_values("date")
    )
    out["ftds"] = out["ftds"].astype(int)
    if "ftd_total_amount" not in out.columns:
        out["ftd_total_amount"] = 0.0
    return out
