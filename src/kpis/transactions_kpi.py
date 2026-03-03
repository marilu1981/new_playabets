"""
transactions_kpi.py
--------------------
Transforms raw transaction Parquet increments into daily KPI summaries.

Output of compute_transactions_daily():
  date, deposits, withdrawals, net_deposits, tx_count, unique_depositors,
  tx_count_accepted, tx_count_pending, tx_count_system, tx_count_other_status
"""
from __future__ import annotations
import pandas as pd
from .io_utils import normalize_cols, ensure_cols, to_date, to_num

# TransactionAmountTypeID often maps to 1=deposit, 2=withdrawal, but this is not
# guaranteed across all source environments. We keep ID-first logic and add
# robust fallbacks below.
DEPOSIT_TYPE_ID = 1
WITHDRAWAL_TYPE_ID = 2


def _status_bucket(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.strip().str.lower()
    out = pd.Series("other_status", index=series.index, dtype="object")
    out[s.str.contains("accept", na=False)] = "accepted"
    out[s.str.contains("pending", na=False)] = "pending"
    out[s.str.contains("system", na=False)] = "system"
    return out


def compute_transactions_daily(transactions: pd.DataFrame) -> pd.DataFrame:
    """
    Returns daily aggregates:
      date, deposits, withdrawals, net_deposits, tx_count, unique_depositors
      plus management status counts grouped into accepted/pending/system/other.
    """
    if transactions.empty:
        return pd.DataFrame(columns=[
            "date", "deposits", "withdrawals", "net_deposits",
            "tx_count", "unique_depositors",
            "tx_count_accepted", "tx_count_pending",
            "tx_count_system", "tx_count_other_status",
        ])

    transactions, tcol = normalize_cols(transactions)
    cols = ensure_cols(
        tcol,
        required_lower=["transactionid", "userid", "amount", "date"],
        context="Transactions",
    )

    tx_id   = cols["transactionid"]
    user_id = cols["userid"]
    amount  = cols["amount"]
    date_c  = cols["date"]
    type_id = tcol.get("transactionamounttypeid")
    type_name = tcol.get("transactionamounttype")
    status_c = tcol.get("transactionmanagementstatus")

    # Keep only latest record per transaction across incremental files.
    order_col = (
        tcol.get("__cursor__")
        or tcol.get("dateversion")
        or tcol.get("detaildateversion")
        or date_c
    )
    transactions["_ord"] = pd.to_datetime(transactions[order_col], errors="coerce")
    transactions = (
        transactions
        .sort_values("_ord")
        .drop_duplicates(subset=[tx_id], keep="last")
    )

    transactions["amount_num"] = to_num(transactions[amount], default=0.0)
    transactions["amount_abs"] = transactions["amount_num"].abs()
    transactions["tx_date"]    = to_date(transactions[date_c])
    if type_id:
        transactions["type_id_num"] = pd.to_numeric(transactions[type_id], errors="coerce").fillna(0).astype(int)
    else:
        transactions["type_id_num"] = 0
    if status_c:
        transactions["status_bucket"] = _status_bucket(transactions[status_c])
    else:
        transactions["status_bucket"] = "other_status"

    dep_mask = transactions["type_id_num"] == DEPOSIT_TYPE_ID
    wd_mask = transactions["type_id_num"] == WITHDRAWAL_TYPE_ID

    # Fallback 1: classify by TransactionAmountType text (if IDs are not 1/2).
    if dep_mask.sum() == 0 and wd_mask.sum() == 0 and type_name:
        t = transactions[type_name].astype(str).str.strip().str.lower()
        dep_mask = t.str.contains("deposit|depo|ricaric|top\\s*up", regex=True, na=False)
        wd_mask = t.str.contains("withdraw|preliev|cash\\s*out|payout", regex=True, na=False)

    # Fallback 2: classify by amount sign.
    if dep_mask.sum() == 0 and wd_mask.sum() == 0:
        dep_mask = transactions["amount_num"] > 0
        wd_mask = transactions["amount_num"] < 0

    deposits = transactions[dep_mask]
    withdrawals = transactions[wd_mask]

    dep_daily = (
        deposits.dropna(subset=["tx_date"])
        .groupby("tx_date")
        .agg(
            deposits=("amount_abs", "sum"),
            unique_depositors=(user_id, "nunique"),
        )
        .reset_index()
        .rename(columns={"tx_date": "date"})
    )

    wd_daily = (
        withdrawals.dropna(subset=["tx_date"])
        .groupby("tx_date")["amount_abs"]
        .sum()
        .rename("withdrawals")
        .reset_index()
        .rename(columns={"tx_date": "date"})
    )

    tx_count_daily = (
        transactions.dropna(subset=["tx_date"])
        .groupby("tx_date")[tx_id]
        .nunique()
        .rename("tx_count")
        .reset_index()
        .rename(columns={"tx_date": "date"})
    )

    status_daily = (
        transactions.dropna(subset=["tx_date"])
        .groupby(["tx_date", "status_bucket"])[tx_id]
        .nunique()
        .rename("count")
        .reset_index()
        .pivot(index="tx_date", columns="status_bucket", values="count")
        .fillna(0)
        .reset_index()
        .rename(columns={"tx_date": "date"})
    )
    status_daily = status_daily.rename(columns={
        "accepted": "tx_count_accepted",
        "pending": "tx_count_pending",
        "system": "tx_count_system",
        "other_status": "tx_count_other_status",
    })
    for c in [
        "tx_count_accepted", "tx_count_pending",
        "tx_count_system", "tx_count_other_status",
    ]:
        if c not in status_daily.columns:
            status_daily[c] = 0

    out = dep_daily.merge(wd_daily, on="date", how="outer")
    out = out.merge(tx_count_daily, on="date", how="outer")
    out = out.merge(status_daily, on="date", how="outer")
    out = out.fillna(0)
    out["deposits"]    = out["deposits"].astype(float)
    out["withdrawals"] = out["withdrawals"].astype(float)
    out["net_deposits"] = out["deposits"] - out["withdrawals"]
    out["tx_count"]    = out["tx_count"].astype(int)
    out["unique_depositors"] = out.get("unique_depositors", pd.Series(0, index=out.index)).astype(int)
    out["tx_count_accepted"] = out.get("tx_count_accepted", pd.Series(0, index=out.index)).astype(int)
    out["tx_count_pending"] = out.get("tx_count_pending", pd.Series(0, index=out.index)).astype(int)
    out["tx_count_system"] = out.get("tx_count_system", pd.Series(0, index=out.index)).astype(int)
    out["tx_count_other_status"] = out.get("tx_count_other_status", pd.Series(0, index=out.index)).astype(int)

    return out.sort_values("date")
