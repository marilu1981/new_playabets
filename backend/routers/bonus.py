"""
routers/bonus.py - Bonus KPI, daily, campaigns, and freebets endpoints.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

from fastapi import APIRouter, Query

from src.kpis.io_utils import to_dt
from backend.core.cache import (
    BONUS_DAILY_PATH,
    CAMPAIGNS_PATH,
    FREEBETS_PATH,
    load_parquet_cached,
)
from backend.core.helpers import _filter_range

router = APIRouter()


@router.get("/bonus/kpis", description="Bonus totals for the period: credited amounts, per-user averages and bonus counts.")
def bonus_kpis(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    df = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)

    if df.empty:
        return {
            "total_bonuses_credited": 0,
            "average_daily_bonus_per_user": 0,
            "est_total_bonuses_per_user": 0,
            "average_daily_unique_bonus_users": 0,
            "bonuses_paid_total_count": 0,
        }

    credited_col = "bonus_credited" if "bonus_credited" in df.columns else None
    count_col = "bonus_count" if "bonus_count" in df.columns else None
    users_col = "unique_bonus_users" if "unique_bonus_users" in df.columns else None

    total_credited = float(df[credited_col].sum()) if credited_col else 0.0
    total_count = int(df[count_col].sum()) if count_col else 0
    avg_daily_users = float(df[users_col].mean()) if users_col else 0.0

    if credited_col and users_col:
        df["_per_user"] = df[credited_col] / df[users_col].clip(lower=1)
        avg_daily_bonus_per_user = float(df["_per_user"].mean())
        est_total_per_user = float(df["_per_user"].sum())
    else:
        avg_daily_bonus_per_user = 0.0
        est_total_per_user = 0.0

    return {
        "total_bonuses_credited": round(total_credited, 2),
        "average_daily_bonus_per_user": round(avg_daily_bonus_per_user, 2),
        "est_total_bonuses_per_user": round(est_total_per_user, 2),
        "average_daily_unique_bonus_users": round(avg_daily_users, 1),
        "bonuses_paid_total_count": total_count,
    }


@router.get("/bonus/daily", description="Daily bonus series: credited, freebets issued/spent and first-deposit bonus figures per day.")
def bonus_daily(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)
    if df.empty:
        return {"points": []}
    df = df.sort_values("date")
    return {
        "points": [
            {
                "date": str(r["date"]),
                "bonus_credited": float(r.get("bonus_credited", 0) or 0),
                "freebet_issued": float(r.get("freebet_issued", 0) or 0),
                "freebet_spend": float(r.get("freebet_spend", 0) or 0),
                "bonus_total": float(r.get("bonus_total", 0) or 0),
                "first_deposit_bonus_count": int(r.get("first_deposit_bonus_count", 0) or 0),
                "first_deposit_bonus_users": int(r.get("first_deposit_bonus_users", 0) or 0),
                "first_deposit_bonus_amount": float(r.get("first_deposit_bonus_amount", 0) or 0),
            }
            for r in df.to_dict("records")
        ]
    }


@router.get("/bonus/campaigns", description="Bonus campaign list with status, type and validity dates, optionally filtered by campaign status.")
def bonus_campaigns(status: Optional[str] = Query(None)):
    campaigns = load_parquet_cached(CAMPAIGNS_PATH, "campaigns")
    if campaigns.empty:
        return {"campaigns": []}
    d = campaigns.copy()
    if status and "CampaignStatus" in d.columns:
        d = d[d["CampaignStatus"].str.lower() == status.lower()]
    rows = []
    for r in d.to_dict(orient="records"):
        rows.append({
            "campaignId": r.get("CampaignID") or r.get("campaignId") or r.get("campaignid"),
            "name": r.get("Name") or r.get("name") or "Unknown Campaign",
            "status": r.get("CampaignStatus") or r.get("campaignStatus") or r.get("status") or "Unknown",
            "bonusType": r.get("BonusType") or r.get("bonusType") or r.get("bonustype") or "Unknown",
            "startDate": str(r.get("ValidityStartDate") or r.get("startDate") or ""),
            "endDate": str(r.get("ValidityEndDate") or r.get("endDate") or ""),
            "usersEnrolled": None,
            "totalPaid": None,
            "roi": None,
        })
    return {"campaigns": rows}


@router.get("/bonus/freebets", description="Free-bet issuance and usage for the period (issued, used, expired, pending, total amount).")
def bonus_freebets(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    if not FREEBETS_PATH.exists():
        return {"issued": 0, "used": 0, "expired": 0, "pending": 0, "total_amount": 0.0, "has_data": False}
    df = load_parquet_cached(FREEBETS_PATH, "freebets")
    if df.empty:
        return {"issued": 0, "used": 0, "expired": 0, "pending": 0, "total_amount": 0.0, "has_data": False}
    if start or end:
        df = df.copy()
        df["_date"] = to_dt(df["InsertDate"]).dt.date
        if start:
            df = df[df["_date"] >= start]
        if end:
            df = df[df["_date"] <= end]
    if df.empty:
        return {"issued": 0, "used": 0, "expired": 0, "pending": 0, "total_amount": 0.0, "has_data": True}
    total = len(df)
    total_amount = float(df["Amount"].sum()) if "Amount" in df.columns else 0.0
    status_col = "FreeBetStatus" if "FreeBetStatus" in df.columns else None
    if not status_col:
        return {"issued": total, "used": 0, "expired": 0, "pending": total, "total_amount": round(total_amount, 2), "has_data": True}
    s = df[status_col].fillna("").str.lower()
    used = int(s.str.contains("wagered|used|played|won|lost|settled").sum())
    expired = int(s.str.contains("expired|void|cancel").sum())
    pending = int(s.str.contains("active|pending|new|open|issued").sum())
    return {
        "issued": total,
        "used": used,
        "expired": expired,
        "pending": pending,
        "total_amount": round(total_amount, 2),
        "has_data": True,
    }
