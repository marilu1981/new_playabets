"""
transactions_kpi.py
--------------------
Transforms raw transaction Parquet increments into daily KPI summaries.

Output of compute_transactions_daily():
  date, deposits, withdrawals, net_deposits, tx_count, unique_depositors
"""
from __future__ import annotations
import pandas as pd
from .io_utils import normalize_cols, ensure_cols, to_date, to_num

# TransactionAmountTypeID: 1 = Positive (deposit), 2 = Negative (withdrawal)
DEPOSIT_TYPE_ID    = 1
WITHDRAWAL_TYPE_ID = 2


def compute_transactions_daily(transactions: pd.DataFrame) -> pd.DataFrame:
    """
    Returns daily aggregates:
      date, deposits, withdrawals, net_deposits, tx_count, unique_depositors
    """
    if transactions.empty:
        return pd.DataFrame(columns=[
            "date", "deposits", "withdrawals", "net_deposits",
            "tx_count", "unique_depositors",
        ])

    transactions, tcol = normalize_cols(transactions)
    cols = ensure_cols(
        tcol,
        required_lower=["transactionid", "userid", "amount", "date", "transactionamounttypeid"],
        context="Transactions",
    )

    tx_id   = cols["transactionid"]
    user_id = cols["userid"]
    amount  = cols["amount"]
    date_c  = cols["date"]
    type_id = cols["transactionamounttypeid"]

    transactions["amount_num"] = to_num(transactions[amount], default=0.0)
    transactions["tx_date"]    = to_date(transactions[date_c])
    transactions["type_id_num"] = pd.to_numeric(transactions[type_id], errors="coerce").fillna(0).astype(int)

    deposits    = transactions[transactions["type_id_num"] == DEPOSIT_TYPE_ID]
    withdrawals = transactions[transactions["type_id_num"] == WITHDRAWAL_TYPE_ID]

    dep_daily = (
        deposits.dropna(subset=["tx_date"])
        .groupby("tx_date")
        .agg(
            deposits=(amount, "sum"),
            unique_depositors=(user_id, "nunique"),
        )
        .reset_index()
        .rename(columns={"tx_date": "date"})
    )

    wd_daily = (
        withdrawals.dropna(subset=["tx_date"])
        .groupby("tx_date")["amount_num"]
        .sum()
        .rename("withdrawals")
        .reset_index()
        .rename(columns={"tx_date": "date"})
    )

    tx_count_daily = (
        transactions.dropna(subset=["tx_date"])
        .groupby("tx_date")[tx_id]
        .count()
        .rename("tx_count")
        .reset_index()
        .rename(columns={"tx_date": "date"})
    )

    out = dep_daily.merge(wd_daily, on="date", how="outer")
    out = out.merge(tx_count_daily, on="date", how="outer")
    out = out.fillna(0)
    out["deposits"]    = out["deposits"].astype(float)
    out["withdrawals"] = out["withdrawals"].astype(float)
    out["net_deposits"] = out["deposits"] - out["withdrawals"]
    out["tx_count"]    = out["tx_count"].astype(int)
    out["unique_depositors"] = out.get("unique_depositors", pd.Series(0, index=out.index)).astype(int)

    return out.sort_values("date")
