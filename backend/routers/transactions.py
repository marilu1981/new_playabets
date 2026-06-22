"""
routers/transactions.py — Transaction KPI, trend, and provider endpoints.
"""
from __future__ import annotations

from datetime import date
import time
from typing import Optional

import pandas as pd

from fastapi import APIRouter, Query
from sqlalchemy import text

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
_PROVIDER_CACHE: dict[tuple, tuple[float, dict]] = {}
_PROVIDER_SQL_CACHE_TTL_SECONDS = 120


def _provider_serving_fingerprint() -> tuple[int, int]:
    if not _PP_DAILY_PATH.exists():
        return (0, 0)
    stat = _PP_DAILY_PATH.stat()
    return (int(stat.st_mtime), int(stat.st_size))


def _provider_cache_fresh(ts: float, file_based: bool) -> bool:
    ttl = 30 * 60 if file_based else _PROVIDER_SQL_CACHE_TTL_SECONDS
    return (time.time() - ts) <= ttl


def _from_provider_daily(start: date, end: date) -> Optional[dict]:
    """Build provider response from serving/payment_providers_daily.parquet when available."""
    if not _PP_DAILY_PATH.exists():
        return None

    daily = load_parquet_cached(_PP_DAILY_PATH, "payment_providers_daily")
    daily = _filter_range(daily, start, end)
    if daily.empty:
        return {"has_data": False, "rows": [], "providers": [], "totals": {"transactions": 0, "positive_amount": 0.0, "negative_amount": 0.0, "total_amount": 0.0}}

    for col in ["deposits", "withdrawals", "net", "deposit_count", "withdrawal_count"]:
        if col not in daily.columns:
            daily[col] = 0.0 if col in {"deposits", "withdrawals", "net"} else 0

    daily["deposits"] = daily["deposits"].fillna(0).astype(float)
    daily["withdrawals"] = daily["withdrawals"].fillna(0).astype(float)
    daily["net"] = daily["net"].fillna(0).astype(float)
    daily["deposit_count"] = daily["deposit_count"].fillna(0).astype(int)
    daily["withdrawal_count"] = daily["withdrawal_count"].fillna(0).astype(int)

    providers_df = (
        daily.groupby("provider", as_index=False)
        .agg(
            deposits=("deposits", "sum"),
            withdrawals=("withdrawals", "sum"),
            net=("net", "sum"),
            deposit_count=("deposit_count", "sum"),
            withdrawal_count=("withdrawal_count", "sum"),
        )
    )
    providers_df = providers_df.sort_values("deposits", ascending=False)

    providers = [
        {
            "provider": str(r["provider"]),
            "deposits": round(float(r["deposits"]), 2),
            "withdrawals": round(-float(abs(r["withdrawals"])), 2),
            "net": round(float(r["net"]), 2),
            "deposit_count": int(r["deposit_count"]),
            "withdrawal_count": int(r["withdrawal_count"]),
        }
        for _, r in providers_df.iterrows()
    ]

    rows: list[dict] = []
    for _, r in providers_df.iterrows():
        provider = str(r["provider"])
        dep_count = int(r["deposit_count"])
        wd_count = int(r["withdrawal_count"])
        dep_amt = float(r["deposits"])
        wd_amt = float(r["withdrawals"])
        if dep_count > 0 or abs(dep_amt) > 0:
            rows.append({
                "provider": provider,
                "reason": "Deposit",
                "transactions": dep_count,
                "amount": round(dep_amt, 2),
                "amount_type_id": 1,
            })
        if wd_count > 0 or abs(wd_amt) > 0:
            rows.append({
                "provider": provider,
                "reason": "Withdrawal",
                "transactions": wd_count,
                "amount": round(-abs(wd_amt), 2),
                "amount_type_id": 2,
            })

    positive_amount = float(providers_df["deposits"].sum())
    negative_amount = -float(providers_df["withdrawals"].sum())
    totals = {
        "transactions": int(providers_df["deposit_count"].sum() + providers_df["withdrawal_count"].sum()),
        "positive_amount": round(positive_amount, 2),
        "negative_amount": round(negative_amount, 2),
        "total_amount": round(positive_amount + negative_amount, 2),
    }

    return {"has_data": True, "rows": rows, "providers": providers, "totals": totals}


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

    serving_fp = _provider_serving_fingerprint()
    source = "file" if serving_fp != (0, 0) else "db"
    cache_key: tuple = (str(start), str(end), source, serving_fp)
    cached = _PROVIDER_CACHE.get(cache_key)
    if cached and _provider_cache_fresh(cached[0], source == "file"):
        return cached[1]

    by_file = _from_provider_daily(start, end)
    if by_file is not None:
        _PROVIDER_CACHE[cache_key] = (time.time(), by_file)
        if len(_PROVIDER_CACHE) > 64:
            _PROVIDER_CACHE.clear()
            _PROVIDER_CACHE[cache_key] = (time.time(), by_file)
        return by_file

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

    response = {"has_data": True, "rows": rows, "providers": providers, "totals": totals}
    _PROVIDER_CACHE[cache_key] = (time.time(), response)
    if len(_PROVIDER_CACHE) > 64:
        _PROVIDER_CACHE.clear()
        _PROVIDER_CACHE[cache_key] = (time.time(), response)
    return response
