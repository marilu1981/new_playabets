"""
routers/transactions.py — Transaction KPI, trend, and provider endpoints.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

from fastapi import APIRouter, Query
from sqlalchemy import text

from src.app_config import ENABLE_TRANSACTIONS
from backend.core.cache import (
    _RAW,
    _SERVING,
    load_parquet_cached,
)
from backend.core.helpers import (
    _filter_range,
    _s,
    _i,
    _load_transactions_df,
)

router = APIRouter()

_PP_DAILY_PATH = _SERVING / "payment_providers_daily.parquet"


def _load_payment_provider_detail(start: date, end: date) -> pd.DataFrame:
    """Load detailed provider rows from local raw parquet exports if available."""
    base = _RAW / "payment_providers"
    if not base.exists():
        return pd.DataFrame()

    files = sorted(base.glob("providers_*.parquet"))
    if not files:
        return pd.DataFrame()

    df = pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)
    if df.empty:
        return df

    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
        df = df[(df["date"] >= start) & (df["date"] <= end)]

    return df


@router.get("/transactions/kpis")
def transactions_kpis(
    start: date = Query(...),
    end: date = Query(...),
):
    if not ENABLE_TRANSACTIONS:
        return {
            "range": {"start": str(start), "end": str(end)},
            "has_data": False,
            "disabled": True,
            "message": "Transactions are temporarily disabled while the source export is unavailable.",
            "deposits": 0.0,
            "withdrawals": 0.0,
            "net_deposits": 0.0,
            "tx_count": 0,
            "unique_depositors": 0,
            "tx_count_accepted": 0,
            "tx_count_pending": 0,
            "tx_count_system": 0,
            "tx_count_other_status": 0,
        }
    df = _load_transactions_df(start, end)
    return {
        "range": {"start": str(start), "end": str(end)},
        "has_data": not df.empty,
        "disabled": False,
        "deposits": _s(df, "deposits"),
        "withdrawals": _s(df, "withdrawals"),
        "net_deposits": _s(df, "net_deposits"),
        "tx_count": _i(df, "tx_count"),
        "unique_depositors": _i(df, "unique_depositors"),
        "tx_count_accepted": _i(df, "tx_count_accepted"),
        "tx_count_pending": _i(df, "tx_count_pending"),
        "tx_count_system": _i(df, "tx_count_system"),
        "tx_count_other_status": _i(df, "tx_count_other_status"),
    }


@router.get("/transactions/trend")
def transactions_trend(
    start: date = Query(...),
    end: date = Query(...),
):
    if not ENABLE_TRANSACTIONS:
        return {
            "has_data": False,
            "disabled": True,
            "message": "Transactions are temporarily disabled while the source export is unavailable.",
            "deposits": [],
            "withdrawals": [],
        }
    df = _load_transactions_df(start, end)
    if df.empty:
        return {"has_data": False, "disabled": False, "deposits": [], "withdrawals": []}
    df = df.sort_values("date")
    records = df.to_dict("records")
    return {
        "has_data": True,
        "disabled": False,
        "deposits": [{"date": str(r["date"]), "value": float(r.get("deposits", 0) or 0)} for r in records],
        "withdrawals": [{"date": str(r["date"]), "value": float(r.get("withdrawals", 0) or 0)} for r in records],
    }


@router.get("/transactions/providers")
def transactions_providers(
    start: date = Query(...),
    end: date = Query(...),
):
    """Detailed provider/reason breakdown plus totals for the Transactions page."""
    if not ENABLE_TRANSACTIONS:
        return {"has_data": False, "rows": [], "providers": [], "totals": {"transactions": 0, "positive_amount": 0.0, "negative_amount": 0.0, "total_amount": 0.0}}

    detail = _load_payment_provider_detail(start, end)
    if not detail.empty:
        detail = detail.copy()
        if "causale_name" in detail.columns:
            detail["provider"] = detail["causale_name"].fillna("Unknown")
        else:
            detail["provider"] = "Unknown"
        if "group_name" in detail.columns:
            detail["reason"] = detail["group_name"].fillna("Unknown")
        else:
            detail["group_name"] = "Unknown"
            detail["reason"] = "Unknown"
        if "reasonid" in detail.columns:
            detail["amount_type_id"] = detail["reasonid"].astype("Int64")
        else:
            detail["amount_type_id"] = pd.NA
        detail["transactions"] = detail["tx_count"].fillna(0).astype(int) if "tx_count" in detail.columns else 0
        detail["amount"] = detail["total_amount"].fillna(0).astype(float) if "total_amount" in detail.columns else 0.0
        if "group_name" in detail.columns:
            detail.loc[detail["group_name"].eq("Withdrawal"), "amount"] *= -1
        detail.loc[detail["group_name"].eq("CancelWithdrawal"), "amount"] = detail.loc[detail["group_name"].eq("CancelWithdrawal"), "amount"].abs()
        detail.loc[detail["group_name"].eq("Deposit"), "amount"] = detail.loc[detail["group_name"].eq("Deposit"), "amount"].abs()
    else:
        try:
            from src.extract.db_utils import build_engine
        except RuntimeError as exc:
            return {
                "has_data": False,
                "disabled": True,
                "message": str(exc),
                "rows": [],
                "providers": [],
                "totals": {"transactions": 0, "positive_amount": 0.0, "negative_amount": 0.0, "total_amount": 0.0},
            }

        engine = build_engine()
        query = text(
            """
            SELECT
                COALESCE(NULLIF(LTRIM(RTRIM(CAST(t.ProviderID AS NVARCHAR(100)))), ''), 'Internal') AS provider,
                COALESCE(rr.Reason, 'Unknown') AS reason,
                CAST(t.TransactionAmountTypeID AS INT) AS amount_type_id,
                COUNT(*) AS transactions,
                SUM(CAST(t.Amount AS FLOAT)) AS amount
            FROM Dwh_en.view_transactions t
            LEFT JOIN Dwh_en.view_Reasons rr ON t.ReasonID = rr.ReasonID
            WHERE t.Date >= :start_dt
              AND t.Date < DATEADD(day, 1, :end_dt)
              AND t.TransactionManagementStatusID = 3
            GROUP BY
                COALESCE(NULLIF(LTRIM(RTRIM(CAST(t.ProviderID AS NVARCHAR(100)))), ''), 'Internal'),
                COALESCE(rr.Reason, 'Unknown'),
                CAST(t.TransactionAmountTypeID AS INT)
            ORDER BY provider, reason, amount_type_id
            """
        )

        with engine.connect() as conn:
            detail = pd.read_sql(query, conn, params={"start_dt": start, "end_dt": end})

    if detail.empty:
        return {"has_data": False, "rows": [], "providers": [], "totals": {"transactions": 0, "positive_amount": 0.0, "negative_amount": 0.0, "total_amount": 0.0}}

    detail["transactions"] = detail["transactions"].astype(int)
    detail["amount"] = detail["amount"].astype(float)
    rows = [
        {
            "provider": str(r["provider"]),
            "reason": str(r["reason"]),
            "transactions": int(r["transactions"]),
            "amount": round(float(r["amount"]), 2),
            "amount_type_id": int(r["amount_type_id"]),
        }
        for _, r in detail.iterrows()
    ]

    providers = []
    for provider, g in detail.groupby("provider"):
        providers.append({
            "provider": str(provider),
            "deposits": round(float(g.loc[g["amount"] > 0, "amount"].sum()), 2),
            "withdrawals": round(float(g.loc[g["amount"] < 0, "amount"].sum()), 2),
            "net": round(float(g["amount"].sum()), 2),
            "deposit_count": int(g.loc[g["amount"] > 0, "transactions"].sum()),
            "withdrawal_count": int(g.loc[g["amount"] < 0, "transactions"].sum()),
        })
    providers = sorted(providers, key=lambda r: r["deposits"], reverse=True)

    totals = {
        "transactions": int(detail["transactions"].sum()),
        "positive_amount": round(float(detail.loc[detail["amount"] > 0, "amount"].sum()), 2),
        "negative_amount": round(float(detail.loc[detail["amount"] < 0, "amount"].sum()), 2),
        "total_amount": round(float(detail["amount"].sum()), 2),
    }

    return {"has_data": True, "rows": rows, "providers": providers, "totals": totals}
