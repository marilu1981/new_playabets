"""
routers/casino.py - Casino KPI, daily, provider, and type endpoints.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

from fastapi import APIRouter, Query

from backend.core.cache import (
    CASINO_DAILY_PATH,
    CASINO_PROVIDERS_DAILY_PATH,
    load_parquet_cached,
)
from backend.core.helpers import (
    _filter_range,
    _s,
    _i,
    _load_transactions_df,
)

router = APIRouter()


@router.get("/casino/kpis", description="Casino KPIs for the period: stakes (real and bonus), winnings, GGR, bets, actives, hold % and depositors.")
def casino_kpis(
    start: date = Query(...),
    end: date = Query(...),
):
    df_all = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)
    # Casino page excludes lotto - use casino_providers_daily to filter
    df = df_all  # casino_daily is already aggregated, lotto exclusion handled in providers
    stake        = _s(df, "casino_total_stake") or _s(df, "casino_stake")   # real + bonus
    stake_real   = _s(df, "casino_stake")
    winnings     = _s(df, "casino_winnings")
    ggr          = _s(df, "casino_total_ggr") or _s(df, "casino_ggr")       # real + bonus
    ggr_real     = _s(df, "casino_ggr")
    bonus_stake  = _s(df, "casino_bonus_stake")
    bonus_ggr    = _s(df, "casino_bonus_ggr")
    tx = _load_transactions_df(start, end)
    depositors = _i(tx, "unique_depositors")
    deposits   = _s(tx, "deposits")
    return {
        "range": {"start": str(start), "end": str(end)},
        "stake":    stake,
        "winnings": winnings,
        "ggr":      ggr,
        "bets":     _i(df, "casino_bets"),
        "actives":  _i(df, "casino_actives"),
        "hold_pct": round(ggr_real / stake_real * 100, 2) if stake_real else 0.0,
        "depositors": depositors,
        "deposit_per_customer": round(deposits / depositors, 2) if depositors > 0 else 0.0,
        "casino_stake":       stake,
        "casino_stake_real":  stake_real,
        "casino_bonus_stake": bonus_stake,
        "casino_winnings":    winnings,
        "casino_ggr":         ggr,
        "casino_ggr_real":    ggr_real,
        "casino_bonus_ggr":   bonus_ggr,
    }


@router.get("/casino/daily", description="Daily casino performance, one row per day.")
def casino_daily(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)
    if df.empty:
        return {"points": []}
    df = df.sort_values("date")
    return {
        "points": [
            {
                "date": str(r["date"]),
                "stake": float(r.get("casino_stake", 0) or 0),
                "winnings": float(r.get("casino_winnings", 0) or 0),
                "ggr": float(r.get("casino_ggr", 0) or 0),
                "casino_actives": int(r.get("casino_actives", 0) or 0) if pd.notna(r.get("casino_actives")) else 0,
            }
            for r in df.to_dict("records")
        ]
    }


@router.get("/casino/providers")
def casino_providers(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    """Provider breakdown from pre-aggregated casino_providers_daily.parquet."""
    df = load_parquet_cached(CASINO_PROVIDERS_DAILY_PATH, "casino_providers_daily")
    if df.empty:
        return {"providers": []}
    if start and end and "date" in df.columns:
        df = _filter_range(df, start, end)
    if df.empty:
        return {"providers": []}
    out = (
        df.groupby("provider_name")
        .agg(stake=("stake", "sum"), winnings=("winnings", "sum"), bets=("bets", "sum"))
        .reset_index()
        .rename(columns={"provider_name": "provider"})
    )
    out["ggr"] = out["stake"] - out["winnings"]
    out["profit"] = out["ggr"]
    # carry casino_type from the most common type per provider
    if "casino_type" in df.columns:
        type_map = df.groupby("provider_name")["casino_type"].agg(lambda x: x.mode().iloc[0] if len(x) else "Casino")
        out["casino_type"] = out["provider"].map(type_map).fillna("Casino")
    return {"providers": out.sort_values("ggr", ascending=False).to_dict(orient="records")}


@router.get("/casino/types", description="Casino performance split by type (Casino vs Live Casino, etc.).")
def casino_types(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    df = load_parquet_cached(CASINO_PROVIDERS_DAILY_PATH, "casino_providers_daily")
    if df.empty or "casino_type" not in df.columns:
        return {"types": []}
    if start and end and "date" in df.columns:
        df = _filter_range(df, start, end)
    if df.empty:
        return {"types": []}
    out = (
        df.groupby("casino_type")
        .agg(stake=("stake", "sum"), winnings=("winnings", "sum"))
        .reset_index()
        .rename(columns={"casino_type": "CasinoType"})
    )
    out["ggr"] = out["stake"] - out["winnings"]
    return {"types": out.sort_values("ggr", ascending=False).to_dict(orient="records")}
