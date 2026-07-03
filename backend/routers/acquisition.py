"""
routers/acquisition.py - Acquisition / Marketing channel endpoints.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

from fastapi import APIRouter, Query

from backend.core.cache import _SERVING, load_parquet_cached

router = APIRouter()

_AFFILIATE_SUMMARY_PATH = _SERVING / "affiliate_summary.parquet"

CHANNEL_ORDER = ["Affiliates", "Google Ads", "Meta", "Influencers", "Organic"]


def _load_affiliate_summary() -> pd.DataFrame:
    if not _AFFILIATE_SUMMARY_PATH.exists():
        return pd.DataFrame()
    return load_parquet_cached(_AFFILIATE_SUMMARY_PATH, "affiliate_summary")


def _filter_period(df: pd.DataFrame, start: Optional[date], end: Optional[date]) -> pd.DataFrame:
    """Filter affiliate summary rows by date_from / date_to overlap if columns exist."""
    if df.empty or start is None or end is None:
        return df
    if "date_from" in df.columns and "date_to" in df.columns:
        df2 = df.copy()
        df2["_from"] = pd.to_datetime(df2["date_from"], errors="coerce").dt.date
        df2["_to"]   = pd.to_datetime(df2["date_to"],   errors="coerce").dt.date
        # Overlapping period: include rows whose fetch window overlaps the requested range
        df2 = df2[(df2["_from"] <= end) & (df2["_to"] >= start)]
        return df2.drop(columns=["_from", "_to"])
    return df


def _channel_placeholder() -> dict:
    return {
        "registrations": 0, "ftds": 0, "ftd_amount": 0.0,
        "revenue": 0.0, "marketing_spend": 0.0,
        "cpa": 0.0, "roi_pct": 0.0, "avg_ftd_value": 0.0,
        "has_data": False,
    }


def _aff_to_channel(df: pd.DataFrame) -> dict:
    if df.empty:
        return {**_channel_placeholder(), "channel": "Affiliates"}
    s = df
    spend  = float(s["marketing_spend"].sum()) if "marketing_spend" in s else 0.0
    ftds   = int(s["ftds"].sum())              if "ftds"            in s else 0
    rev    = float(s["revenue"].sum())         if "revenue"         in s else 0.0
    ftdv   = float(s["ftd_amount"].sum())      if "ftd_amount"      in s else 0.0
    regs   = int(s["registrations"].sum())     if "registrations"   in s else 0
    clicks = int(s["clicks"].sum())            if "clicks"          in s else 0
    return {
        "channel":        "Affiliates",
        "registrations":  regs,
        "clicks":         clicks,
        "ftds":           ftds,
        "ftd_amount":     round(ftdv, 2),
        "revenue":        round(rev, 2),
        "marketing_spend": round(spend, 2),
        "cpa":            round(spend / ftds, 2)                          if ftds > 0   else 0.0,
        "roi_pct":        round((rev - spend) / spend * 100, 1)           if spend > 0  else 0.0,
        "avg_ftd_value":  round(ftdv / ftds, 2)                           if ftds > 0   else 0.0,
        "has_data":       True,
    }


@router.get("/acquisition/kpis")
def acquisition_kpis(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
):
    """Period-total acquisition KPIs rolled up across all channels."""
    df = _load_affiliate_summary()
    df = _filter_period(df, start, end)
    aff = _aff_to_channel(df)

    total_spend = aff["marketing_spend"]
    total_ftds  = aff["ftds"]
    total_rev   = aff["revenue"]
    total_ftdv  = aff["ftd_amount"]
    total_regs  = aff["registrations"]

    return {
        "range": {"start": str(start) if start else None, "end": str(end) if end else None},
        "has_data": df is not None and not df.empty if not isinstance(df, pd.DataFrame) else not df.empty,
        "totals": {
            "registrations":  total_regs,
            "ftds":           total_ftds,
            "ftd_amount":     round(total_ftdv, 2),
            "revenue":        round(total_rev, 2),
            "marketing_spend": round(total_spend, 2),
            "cpa":            round(total_spend / total_ftds, 2)                        if total_ftds > 0  else 0.0,
            "roi_pct":        round((total_rev - total_spend) / total_spend * 100, 1)   if total_spend > 0 else 0.0,
            "avg_ftd_value":  round(total_ftdv / total_ftds, 2)                         if total_ftds > 0  else 0.0,
        },
    }


@router.get("/acquisition/channels")
def acquisition_channels(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
):
    """Per-channel breakdown derived from RavenTrack affiliate classification."""
    from src.kpis.affiliate_kpis import compute_channel_totals
    df = _load_affiliate_summary()
    df = _filter_period(df, start, end)
    channels = compute_channel_totals(df)
    return {
        "range": {"start": str(start) if start else None, "end": str(end) if end else None},
        "channels": channels,
        "has_data": not df.empty if isinstance(df, pd.DataFrame) else False,
    }


@router.get("/acquisition/affiliates")
def acquisition_affiliates(
    start:  Optional[date] = Query(None),
    end:    Optional[date] = Query(None),
    limit:  int = Query(100, ge=1, le=1000),
    sort_by: str = Query("revenue"),
):
    """Per-affiliate leaderboard table."""
    df = _load_affiliate_summary()
    df = _filter_period(df, start, end)

    if df.empty:
        return {"rows": [], "total": 0, "has_data": False}

    valid_sort = ["revenue", "marketing_spend", "ftds", "registrations", "cpa", "roi_pct"]
    col = sort_by if sort_by in valid_sort and sort_by in df.columns else "revenue"
    df = df.sort_values(col, ascending=False)

    rows = df.head(limit).to_dict(orient="records")
    for row in rows:
        for k, v in row.items():
            if hasattr(v, "item"):
                row[k] = v.item()
            elif pd.isna(v) if not isinstance(v, (list, dict)) else False:
                row[k] = None

    return {
        "rows": rows,
        "total": len(df),
        "has_data": True,
        "range": {"start": str(start) if start else None, "end": str(end) if end else None},
    }
