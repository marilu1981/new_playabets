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
    VIP_ROSTER_PATH,
    load_parquet_cached,
    load_daily_df,
)
from backend.core.helpers import _filter_range
from backend.core.filters import (
    _normalize_value,
    _load_latest_users,
    _load_users_for_filters,
    _apply_user_filters,
)

router = APIRouter()


def _normalize_vip_stage(series: pd.Series) -> pd.Series:
    stage_map = {
        "hosted vip": "Hosted VIP",
        "unhosted vip": "Unhosted VIP",
        "self excluded": "Self Excluded",
        "self-excluded": "Self Excluded",
        "time-out": "Time-Out",
        "timeout": "Time-Out",
    }
    cleaned = series.fillna("Unknown").astype(str).str.strip()
    return cleaned.map(lambda s: stage_map.get(s.lower(), s if s else "Unknown"))


def _ensure_vip_roster_shape(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=[
            "userid", "account_manager", "vip_lifecycle_stage", "onboard_date", "offboard_date", "is_current", "is_date_error",
        ])

    roster, mapping = normalize_cols(df)
    rename: dict[str, str] = {}
    for key, target in {
        "userid": "userid",
        "user_id": "userid",
        "accountmanager": "account_manager",
        "account_manager": "account_manager",
        "viplifecyclestage": "vip_lifecycle_stage",
        "vip_lifecycle_stage": "vip_lifecycle_stage",
        "onboarddate": "onboard_date",
        "onboard_date": "onboard_date",
        "offboarddate": "offboard_date",
        "offboard_date": "offboard_date",
        "iscurrent": "is_current",
        "is_current": "is_current",
        "isdateerror": "is_date_error",
        "is_date_error": "is_date_error",
    }.items():
        col = mapping.get(key)
        if col:
            rename[col] = target
    roster = roster.rename(columns=rename)

    for col in ["userid", "account_manager", "vip_lifecycle_stage", "onboard_date", "offboard_date", "is_current", "is_date_error"]:
        if col not in roster.columns:
            roster[col] = None

    roster["userid"] = pd.to_numeric(roster["userid"], errors="coerce").astype("Int64")
    roster["account_manager"] = roster["account_manager"].fillna("Unassigned").astype(str).str.strip().replace("", "Unassigned")
    roster["vip_lifecycle_stage"] = _normalize_vip_stage(roster["vip_lifecycle_stage"])
    roster["onboard_date"] = pd.to_datetime(roster["onboard_date"], errors="coerce", dayfirst=True).dt.date

    raw_offboard = roster["offboard_date"].fillna("").astype(str).str.strip()
    offboard_blank = raw_offboard.isin(["", "-", "nan", "NaT", "None"])
    roster["offboard_date"] = pd.to_datetime(raw_offboard.where(~offboard_blank, None), errors="coerce", dayfirst=True).dt.date
    roster["is_current"] = roster["offboard_date"].isna()
    roster["is_date_error"] = roster["offboard_date"].notna() & roster["onboard_date"].notna() & (roster["offboard_date"] < roster["onboard_date"])

    roster = roster.dropna(subset=["userid"]).sort_values(["account_manager", "vip_lifecycle_stage", "userid", "onboard_date"], kind="stable")
    return roster.reset_index(drop=True)


def _load_vip_roster() -> pd.DataFrame:
    if VIP_ROSTER_PATH.exists():
        roster = load_parquet_cached(VIP_ROSTER_PATH, "vip_roster")
        if not roster.empty:
            return _ensure_vip_roster_shape(roster)

    if not VIP_LIST_PATH.exists():
        return pd.DataFrame()
    try:
        csv_rows = pd.read_csv(VIP_LIST_PATH)
    except Exception:
        return pd.DataFrame()
    return _ensure_vip_roster_shape(csv_rows)


def _apply_vip_filters(df: pd.DataFrame, account_manager: Optional[str], stage: Optional[str]) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    am = _normalize_value(account_manager)
    if am:
        out = out[out["account_manager"].astype(str).str.strip().str.lower() == am.lower()]
    st = _normalize_value(stage)
    if st:
        out = out[out["vip_lifecycle_stage"].astype(str).str.strip().str.lower() == st.lower()]
    return out


def _vip_overlap_mask(df: pd.DataFrame, start: Optional[date], end: Optional[date]) -> pd.Series:
    valid = (~df["is_date_error"].fillna(False)) & df["onboard_date"].notna()
    if start is None or end is None:
        return valid
    return valid & (df["onboard_date"] <= end) & (df["offboard_date"].isna() | (df["offboard_date"] >= start))


def _vip_active_as_of_mask(df: pd.DataFrame, as_of: date) -> pd.Series:
    valid = (~df["is_date_error"].fillna(False)) & df["onboard_date"].notna()
    return valid & (df["onboard_date"] <= as_of) & (df["offboard_date"].isna() | (df["offboard_date"] >= as_of))


def _load_vip_user_details() -> pd.DataFrame:
    users = _load_latest_users()
    if users.empty:
        return pd.DataFrame(columns=["userid", "name", "surname", "country", "userstatus", "balance"])

    details, mapping = normalize_cols(users)
    rename: dict[str, str] = {}
    for key in ["userid", "name", "surname", "country", "userstatus", "balance"]:
        col = mapping.get(key)
        if col:
            rename[col] = key
    details = details.rename(columns=rename)
    if "userid" not in details.columns:
        return pd.DataFrame(columns=["userid", "name", "surname", "country", "userstatus", "balance"])

    details["userid"] = pd.to_numeric(details["userid"], errors="coerce").astype("Int64")
    keep = [c for c in ["userid", "name", "surname", "country", "userstatus", "balance"] if c in details.columns]
    details = details[keep].dropna(subset=["userid"]).drop_duplicates(subset=["userid"], keep="last")
    return details


def _serialize_vip_rows(df: pd.DataFrame) -> list[dict]:
    records = df.to_dict(orient="records")
    for row in records:
        row["user_id"] = str(row.pop("userid")) if row.get("userid") is not None and pd.notna(row.get("userid")) else None
        for key in ("onboard_date", "offboard_date"):
            row[key] = str(row[key]) if row.get(key) is not None and pd.notna(row.get(key)) else None
        for key in ("balance",):
            if row.get(key) is not None and pd.notna(row.get(key)):
                row[key] = round(float(row[key]), 2)
            else:
                row[key] = None
        for key in ("is_current", "is_date_error"):
            row[key] = bool(row.get(key))
    return records


@router.get("/vip/list")
def vip_list(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    current_only: bool = Query(False),
    limit: int = Query(250, ge=1, le=5000),
):
    df = _load_vip_roster()
    if df.empty:
        return {"rows": [], "total": 0, "unique_users": 0, "has_data": False}

    d = _apply_vip_filters(df, account_manager, stage)
    if start and end:
        d = d[_vip_overlap_mask(d, start, end)]
    else:
        d = d[_vip_overlap_mask(d, None, None)]
    if current_only:
        d = d[_vip_active_as_of_mask(d, end or date.today())]

    if not d.empty:
        details = _load_vip_user_details()
        if not details.empty:
            d = d.merge(details, on="userid", how="left")

    d = d.sort_values(["is_current", "account_manager", "vip_lifecycle_stage", "userid", "onboard_date"], ascending=[False, True, True, True, False], kind="stable")
    total = int(len(d))
    unique_users = int(d["userid"].dropna().nunique()) if "userid" in d.columns else 0
    rows = d.head(limit)[[c for c in [
        "userid", "name", "surname", "account_manager", "vip_lifecycle_stage", "country", "userstatus", "balance",
        "onboard_date", "offboard_date", "is_current", "is_date_error",
    ] if c in d.columns]].copy()
    records = _serialize_vip_rows(rows)
    return {
        "rows": records,
        "total": total,
        "unique_users": unique_users,
        "has_data": True,
        "filters_applied": {
            "start": str(start) if start else None,
            "end": str(end) if end else None,
            "account_manager": bool(account_manager),
            "stage": bool(stage),
            "current_only": current_only,
        },
    }


@router.get("/vip/summary")
def vip_summary(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
):
    df = _load_vip_roster()
    if df.empty:
        return {
            "has_data": False,
            "total": 0,
            "stints": 0,
            "active_now": 0,
            "active_as_of_end": 0,
            "onboarded_in_period": 0,
            "offboarded_in_period": 0,
            "with_onboard_date": 0,
            "date_errors": 0,
            "by_stage": [],
            "by_account_manager": [],
            "account_managers": [],
            "stages": [],
        }

    base = _apply_vip_filters(df, account_manager, stage)
    valid = base[_vip_overlap_mask(base, None, None)]
    period_df = valid[_vip_overlap_mask(valid, start, end)] if start and end else valid
    as_of = end or date.today()
    active_as_of = valid[_vip_active_as_of_mask(valid, as_of)]
    onboarded = valid[(valid["onboard_date"].notna()) & ((start is None) or (valid["onboard_date"] >= start)) & ((end is None) or (valid["onboard_date"] <= end))]
    offboarded = valid[(valid["offboard_date"].notna()) & ((start is None) or (valid["offboard_date"] >= start)) & ((end is None) or (valid["offboard_date"] <= end))]

    total = int(period_df["userid"].dropna().nunique()) if not period_df.empty else 0
    stage_counts = period_df.groupby("vip_lifecycle_stage")["userid"].nunique().sort_values(ascending=False) if not period_df.empty else pd.Series(dtype="int64")
    manager_counts = period_df.groupby("account_manager")["userid"].nunique().sort_values(ascending=False) if not period_df.empty else pd.Series(dtype="int64")

    return {
        "has_data": True,
        "total": total,
        "stints": int(len(period_df)),
        "active_now": int(active_as_of["userid"].dropna().nunique()) if not active_as_of.empty else 0,
        "active_as_of_end": int(active_as_of["userid"].dropna().nunique()) if not active_as_of.empty else 0,
        "onboarded_in_period": int(onboarded["userid"].dropna().nunique()) if not onboarded.empty else 0,
        "offboarded_in_period": int(offboarded["userid"].dropna().nunique()) if not offboarded.empty else 0,
        "with_onboard_date": int(valid["onboard_date"].notna().sum()),
        "date_errors": int(base["is_date_error"].fillna(False).sum()),
        "by_stage": [{"stage": str(stage), "count": int(count)} for stage, count in stage_counts.items()],
        "by_account_manager": [{"account_manager": str(manager), "count": int(count)} for manager, count in manager_counts.items()],
        "account_managers": sorted(base["account_manager"].dropna().astype(str).str.strip().unique().tolist()),
        "stages": sorted(base["vip_lifecycle_stage"].dropna().astype(str).str.strip().unique().tolist()),
        "filters_applied": {
            "start": str(start) if start else None,
            "end": str(end) if end else None,
            "account_manager": bool(account_manager),
            "stage": bool(stage),
        },
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
