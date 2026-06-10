"""
routers/users.py — User status, self-exclusions, and RFM endpoints.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

from fastapi import APIRouter, Query

from src.kpis.io_utils import normalize_cols
from backend.core.cache import (
    RFM_USERS_PATH,
    RFM_MONTHLY_PATH,
    SELFEXCLUSIONS_PATH,
    SOCIOTOPO_PATH,
    VIP_LIST_PATH,
    load_parquet_cached,
    load_daily_df,
)
from backend.core.helpers import _filter_range
from backend.core.filters import (
    _normalize_value,
    _load_users_for_filters,
    _apply_user_filters,
)

router = APIRouter()


def _load_vip_list() -> pd.DataFrame:
    if not VIP_LIST_PATH.exists():
        return pd.DataFrame()
    try:
        df = pd.read_csv(VIP_LIST_PATH)
    except Exception:
        return pd.DataFrame()
    if df.empty:
        return df
    df, _ = normalize_cols(df)
    rename_map = {
        "userid": "user_id",
        "accountmanager": "account_manager",
        "viplifecyclestage": "vip_lifecycle_stage",
        "onboarddate": "onboard_date",
        "offboarddate": "offboard_date",
    }
    cols = {c: rename_map.get(c, c) for c in df.columns}
    df = df.rename(columns=cols)
    for col in ["user_id", "account_manager", "vip_lifecycle_stage", "onboard_date", "offboard_date"]:
        if col not in df.columns:
            df[col] = None
    df["user_id"] = df["user_id"].astype(str).str.strip()
    df["account_manager"] = df["account_manager"].fillna("Unassigned").astype(str).str.strip().replace("", "Unassigned")
    df["vip_lifecycle_stage"] = df["vip_lifecycle_stage"].fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
    df["onboard_date"] = pd.to_datetime(df["onboard_date"], errors="coerce").dt.date
    if "offboard_date" in df.columns:
        df["offboard_date"] = pd.to_datetime(df["offboard_date"], errors="coerce").dt.date
    return df


@router.get("/vip/list")
def vip_list(
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    limit: int = Query(250, ge=1, le=5000),
):
    df = _load_vip_list()
    if df.empty:
        return {"rows": [], "total": 0, "has_data": False}

    d = df.copy()
    if account_manager:
        am = str(account_manager).strip()
        d = d[d["account_manager"].astype(str) == am]
    if stage:
        st = str(stage).strip()
        d = d[d["vip_lifecycle_stage"].astype(str) == st]

    d = d.sort_values(["vip_lifecycle_stage", "account_manager", "user_id"], kind="stable")
    total = int(len(d))
    rows = d.head(limit)[[c for c in ["user_id", "account_manager", "vip_lifecycle_stage", "onboard_date", "offboard_date"] if c in d.columns]].copy()
    records = rows.to_dict(orient="records")
    for row in records:
        if row.get("onboard_date") is not None:
            row["onboard_date"] = str(row["onboard_date"])
        if row.get("offboard_date") is not None:
            row["offboard_date"] = str(row["offboard_date"])
    return {
        "rows": records,
        "total": total,
        "has_data": True,
        "filters_applied": {
            "account_manager": bool(account_manager),
            "stage": bool(stage),
        },
    }


@router.get("/vip/summary")
def vip_summary():
    df = _load_vip_list()
    if df.empty:
        return {"has_data": False, "total": 0, "by_stage": [], "by_account_manager": []}

    total = int(len(df))
    stage_counts = df["vip_lifecycle_stage"].fillna("Unknown").astype(str).str.strip().replace("", "Unknown").value_counts()
    manager_counts = df["account_manager"].fillna("Unassigned").astype(str).str.strip().replace("", "Unassigned").value_counts()
    onboarded = int(df["onboard_date"].notna().sum()) if "onboard_date" in df.columns else 0
    active_now = int((df.get("vip_lifecycle_stage", pd.Series(dtype=str)).astype(str).str.lower() == "hosted vip").sum()) if "vip_lifecycle_stage" in df.columns else 0

    return {
        "has_data": True,
        "total": total,
        "active_now": active_now,
        "with_onboard_date": onboarded,
        "by_stage": [{"stage": str(stage), "count": int(count)} for stage, count in stage_counts.items()],
        "by_account_manager": [{"account_manager": str(manager), "count": int(count)} for manager, count in manager_counts.items()],
    }


@router.get("/users/status-breakdown")
def users_status_breakdown(
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    users = _apply_user_filters(_load_users_for_filters(), territory, country, customer_status)
    seg = _normalize_value(current_segment)
    if seg and not users.empty and "userid" in users.columns:
        rfm = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
        if not rfm.empty and "segment" in rfm.columns and "userid" in rfm.columns:
            seg_ids = set(rfm[rfm["segment"].astype(str) == seg]["userid"].astype(str).dropna())
            users = users[users["userid"].astype(str).isin(seg_ids)]
    if users.empty or "userstatus" not in users.columns:
        return {"statuses": []}
    statuses = users["userstatus"].fillna("Unknown").astype(str).str.strip()
    statuses.loc[statuses == ""] = "Unknown"
    counts = statuses.value_counts()
    return {
        "statuses": [{"status": str(status), "count": int(count)} for status, count in counts.items()],
        "filters_applied": {
            "territory": bool(_normalize_value(territory)),
            "country": bool(_normalize_value(country)),
            "customer_status": bool(_normalize_value(customer_status)),
            "current_segment": bool(seg),
        },
    }


@router.get("/users/self-exclusions")
def users_self_exclusions():
    if not SELFEXCLUSIONS_PATH.exists():
        return {"total": 0, "inProgress": 0, "pending": 0, "completed": 0, "byPeriod": [], "has_data": False}

    df = load_parquet_cached(SELFEXCLUSIONS_PATH, "selfexclusions")
    if df.empty:
        return {"total": 0, "inProgress": 0, "pending": 0, "completed": 0, "byPeriod": [], "has_data": False}

    df, _ = normalize_cols(df)

    status_col = next((c for c in df.columns if c == "selfexclusionstatus"), None)
    period_col = next((c for c in df.columns if c == "selfexclusionperiod"), None)

    total = len(df)
    in_progress = 0
    pending = 0
    completed = 0
    if status_col:
        statuses = df[status_col].fillna("").astype(str).str.strip().str.lower()
        in_progress = int((statuses == "in progress").sum())
        pending = int((statuses == "pending").sum())
        completed = int((statuses == "completed").sum())

    by_period: list[dict] = []
    if period_col:
        counts = df[period_col].fillna("Unknown").astype(str).str.strip().value_counts()
        by_period = [{"period": str(p), "count": int(c)} for p, c in counts.items()]

    return {
        "total": total,
        "inProgress": in_progress,
        "pending": pending,
        "completed": completed,
        "byPeriod": by_period,
        "has_data": True,
    }


@router.get("/users/self-exclusions/trend")
def users_self_exclusions_trend(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    """Return monthly self-exclusion trend: how many started/active/completed per month."""
    if not SELFEXCLUSIONS_PATH.exists():
        return {"points": []}

    df = load_parquet_cached(SELFEXCLUSIONS_PATH, "selfexclusions")
    if df.empty:
        return {"points": []}

    df, _ = normalize_cols(df)

    # Try common date column names for exclusion start date
    date_col = next(
        (c for c in df.columns if c in ("startdate", "selfexclusiondate", "creationdate", "insertdate", "startdt")),
        None,
    )
    status_col = next((c for c in df.columns if c == "selfexclusionstatus"), None)

    if not date_col:
        return {"points": []}

    df["_dt"] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=["_dt"])
    df["_month"] = df["_dt"].dt.to_period("M").dt.to_timestamp()

    if start:
        df = df[df["_dt"].dt.date >= start]
    if end:
        df = df[df["_dt"].dt.date <= end]

    if df.empty:
        return {"points": []}

    if status_col:
        statuses = df[status_col].fillna("").astype(str).str.strip().str.lower()
        df["_status_norm"] = statuses
        monthly = df.groupby("_month").apply(
            lambda g: pd.Series({
                "started": len(g),
                "completed": int((g["_status_norm"] == "completed").sum()),
                "active": int((g["_status_norm"] == "in progress").sum()),
            })
        ).reset_index()
    else:
        monthly = df.groupby("_month").size().reset_index(name="started")
        monthly["completed"] = 0
        monthly["active"] = 0

    points = [
        {
            "date": str(r["_month"].date()),
            "started": int(r.get("started", 0)),
            "active": int(r.get("active", 0)),
            "completed": int(r.get("completed", 0)),
        }
        for _, r in monthly.iterrows()
    ]
    points.sort(key=lambda x: x["date"])
    return {"points": points}


@router.get("/rfm/segments")
def rfm_segments(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    mode: Optional[str] = Query(None),
):
    rfm_cols = ["date", "rfm_vip", "rfm_active", "rfm_new", "rfm_cooling", "rfm_lapsed", "rfm_dormant"]

    # 1. Monthly snapshots (backfilled history) — highest priority
    if str(mode or "").lower() != "snapshot" and RFM_MONTHLY_PATH.exists():
        monthly = load_parquet_cached(RFM_MONTHLY_PATH, "rfm_monthly")
        if not monthly.empty and all(col in monthly.columns for col in rfm_cols):
            d = monthly[rfm_cols].copy()
            if start and end:
                d = _filter_range(d, start, end)
            rows = d.to_dict(orient="records")
            if rows:
                return {"rows": rows, "source": "rfm_monthly"}

    # 2. Daily KPIs rfm columns (single-day snapshots attached to each run)
    if str(mode or "").lower() != "snapshot":
        daily = load_daily_df()
        if not daily.empty and all(col in daily.columns for col in rfm_cols):
            d = daily[rfm_cols].copy()
            if start and end:
                d = _filter_range(d, start, end)
            rows = d.to_dict(orient="records")
            if rows:
                return {"rows": rows, "source": "daily_kpis"}

    df = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    if df.empty or "segment" not in df.columns:
        return {"rows": [], "source": "rfm_users"}

    counts = df["segment"].fillna("Unknown").astype(str).str.strip()
    counts.loc[counts == ""] = "Unknown"
    grouped = counts.value_counts().to_dict()
    daily = load_daily_df()
    snapshot_date = str(end or start or (daily["date"].max() if not daily.empty else date.today()))
    return {
        "rows": [{
            "date": snapshot_date,
            "rfm_vip": int(grouped.get("VIP", 0)),
            "rfm_active": int(grouped.get("Active", 0)),
            "rfm_new": int(grouped.get("New", 0)),
            "rfm_cooling": int(grouped.get("Cooling", 0)),
            "rfm_lapsed": int(grouped.get("Lapsed", 0)),
            "rfm_dormant": int(grouped.get("Dormant", 0)),
        }],
        "source": "rfm_users",
    }


@router.get("/rfm/users")
def rfm_users(
    segment: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=5000),
    columns: Optional[str] = Query(None),
):
    df = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    if df.empty:
        return {"users": []}
    d = df.copy()
    if segment and "segment" in d.columns:
        d = d[d["segment"].astype(str) == segment]
    if columns:
        wanted = [c.strip() for c in columns.split(",") if c.strip()]
        keep = [c for c in wanted if c in d.columns]
        if keep:
            d = d[keep]
    if "rfm_score" in d.columns:
        d = d.sort_values("rfm_score", ascending=False)
    users = d.head(limit).to_dict(orient="records")
    for row in users:
        if "segment" in row and "rfm_segment" not in row:
            row["rfm_segment"] = row["segment"]
        if "frequency_30d" in row and "frequency" not in row:
            row["frequency"] = row["frequency_30d"]
        if "monetary_30d" in row and "monetary" not in row:
            row["monetary"] = row["monetary_30d"]
    return {"users": users}


@router.get("/rfm/risk")
def rfm_risk():
    """Summary of SocioTopography risk tiers across all users."""
    df = load_parquet_cached(SOCIOTOPO_PATH, "sociotopo_features")
    if df.empty or "risk_tier" not in df.columns:
        return {
            "has_data": False,
            "tiers": {"Critical": 0, "High": 0, "Moderate": 0, "Low": 0},
            "total_users": 0,
            "computed_at": None,
        }
    tier_counts = df["risk_tier"].value_counts().to_dict()
    tiers = {
        "Critical": int(tier_counts.get("Critical", 0)),
        "High":     int(tier_counts.get("High",     0)),
        "Moderate": int(tier_counts.get("Moderate", 0)),
        "Low":      int(tier_counts.get("Low",      0)),
    }
    result: dict = {
        "has_data":    True,
        "tiers":       tiers,
        "total_users": int(len(df)),
    }
    if "segment" in df.columns:
        seg_tier = (
            df.groupby(["segment", "risk_tier"])
            .size()
            .reset_index(name="count")
            .to_dict(orient="records")
        )
        result["segment_breakdown"] = seg_tier
    avg_cols = ["risk_score", "fc_score", "bil_score", "oi_score"]
    present = [c for c in avg_cols if c in df.columns]
    if present:
        result["avg_scores"] = {c: round(float(df[c].mean()), 3) for c in present}
    return result


@router.get("/rfm/risk/players")
def rfm_risk_players(
    tier: Optional[str]    = Query(None, description="Filter by risk tier (Critical, High, Moderate, Low)"),
    segment: Optional[str] = Query(None, description="Filter by RFM segment (VIP, Active, Lapsed…)"),
    limit: int             = Query(200, ge=1, le=2000),
):
    """Return individual players from sociotopo_features, ordered by risk_score desc."""
    df = load_parquet_cached(SOCIOTOPO_PATH, "sociotopo_features")
    if df.empty:
        return {"players": [], "total": 0}
    d = df.copy()
    if tier and "risk_tier" in d.columns:
        d = d[d["risk_tier"].astype(str) == tier]
    if segment and "segment" in d.columns:
        d = d[d["segment"].astype(str) == segment]
    if "risk_score" in d.columns:
        d = d.sort_values("risk_score", ascending=False)
    total = len(d)
    keep_cols = [c for c in [
        "userid", "segment", "risk_tier", "risk_score",
        "fc_score", "bil_score", "oi_score",
        "bets_30d", "casino_bets_30d", "sessions_30d",
        "net_cashflow_30d", "balance_raw",
        "loss_rate_30d", "max_losing_streak_30d",
        "self_exclusion_flag", "status_risk",
    ] if c in d.columns]
    players = d[keep_cols].head(limit).to_dict(orient="records")
    for p in players:
        for k, v in p.items():
            if hasattr(v, "item"):
                p[k] = v.item()
    return {"players": players, "total": total}
