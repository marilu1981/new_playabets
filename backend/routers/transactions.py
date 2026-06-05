"""
routers/transactions.py — Transaction KPI, trend, and provider endpoints.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

from fastapi import APIRouter, Query

from src.app_config import ENABLE_TRANSACTIONS
from backend.core.cache import (
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
    """Deposit and withdrawal totals grouped by payment provider."""
    if not _PP_DAILY_PATH.exists():
        return {"providers": [], "has_data": False}

    df = load_parquet_cached(_PP_DAILY_PATH, "payment_providers_daily")
    if df.empty:
        return {"providers": [], "has_data": False}

    df["_d"] = pd.to_datetime(df["date"], errors="coerce").dt.date
    df = df[(df["_d"] >= start) & (df["_d"] <= end)]
    if df.empty:
        return {"providers": [], "has_data": False}

    agg = (df.groupby("provider")
           .agg(
               deposits=("deposits", "sum"),
               withdrawals=("withdrawals", "sum"),
               net=("net", "sum"),
               deposit_count=("deposit_count", "sum"),
               withdrawal_count=("withdrawal_count", "sum"),
           )
           .reset_index()
           .sort_values("deposits", ascending=False))

    providers = [
        {
            "provider": str(r["provider"]),
            "deposits": round(float(r["deposits"]), 2),
            "withdrawals": round(float(r["withdrawals"]), 2),
            "net": round(float(r["net"]), 2),
            "deposit_count": int(r["deposit_count"]),
            "withdrawal_count": int(r["withdrawal_count"]),
        }
        for _, r in agg.iterrows()
        if r["deposits"] > 0 or r["withdrawals"] > 0
    ]

    return {"providers": providers, "has_data": bool(providers)}
