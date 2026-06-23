"""
routers/users.py — User status, self-exclusions, and RFM endpoints.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

import io
import time
import pandas as pd

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from src.kpis.io_utils import normalize_cols
from backend.core.cache import (
    RFM_USERS_PATH,
    RFM_MONTHLY_PATH,
    SELFEXCLUSIONS_PATH,
    SOCIOTOPO_PATH,
    VIP_LIST_PATH,
    VIP_ROSTER_PATH,
    _PARQUET_CACHE,
    load_parquet_cached,
    load_daily_df,
)
from backend.core.helpers import _filter_range
from backend.core.filters import (
    _normalize_value,
    _load_latest_users,
    _load_users_for_filters,
    _apply_user_filters,
    _per_user_wagering,
)

router = APIRouter()

# Short-lived caches for heavy VIP computations.
_VIP_CACHE_TTL_SECONDS = 180
_VIP_JOIN_CACHE: dict[tuple, tuple[float, pd.DataFrame]] = {}
_VIP_OVERVIEW_CACHE: dict[tuple, tuple[float, dict]] = {}


def _vip_cache_fresh(ts: float) -> bool:
    return (time.time() - ts) <= _VIP_CACHE_TTL_SECONDS


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
        # underscore / no-separator variants (from parquet / internal use)
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
        # space-separated variants (raw CSV column headers)
        "user id": "userid",
        "account manager": "account_manager",
        "vip lifecycle stage": "vip_lifecycle_stage",
        "onboard date": "onboard_date",
        "offboard date": "offboard_date",
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
        return pd.DataFrame(columns=["userid", "name", "surname", "country", "userstatus", "balance", "birthdate"])

    details, mapping = normalize_cols(users)
    rename: dict[str, str] = {}
    for key in ["userid", "name", "surname", "country", "userstatus", "balance", "birthdate"]:
        col = mapping.get(key)
        if col:
            rename[col] = key
    details = details.rename(columns=rename)
    if "userid" not in details.columns:
        return pd.DataFrame(columns=["userid", "name", "surname", "country", "userstatus", "balance", "birthdate"])

    details["userid"] = pd.to_numeric(details["userid"], errors="coerce").astype("Int64")
    keep = [c for c in ["userid", "name", "surname", "country", "userstatus", "balance", "birthdate"] if c in details.columns]
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


@router.post("/vip/upload")
async def vip_upload(file: UploadFile = File(...)):
    """
    Merge an uploaded VIP CSV into the roster.

    Stint identity key: (userid, account_manager, vip_lifecycle_stage, onboard_date).
    - Exact match on all 5 columns → unchanged (skipped).
    - Key match but different offboard_date → updated.
    - No key match → added as a new stint.

    Returns counts for added / updated / unchanged rows.
    """
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    try:
        incoming_raw = pd.read_csv(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    incoming = _ensure_vip_roster_shape(incoming_raw)
    if incoming.empty:
        raise HTTPException(status_code=400, detail="CSV contained no valid VIP rows after normalisation")

    KEY_COLS = ["userid", "account_manager", "vip_lifecycle_stage", "onboard_date"]

    existing = _load_vip_roster()

    if existing.empty:
        merged = incoming.copy()
        n_added = len(merged)
        n_updated = 0
        n_unchanged = 0
    else:
        def _row_key(df: pd.DataFrame) -> list[tuple]:
            return list(df[KEY_COLS].astype(str).apply(tuple, axis=1))

        existing_keys = _row_key(existing)
        existing_key_index: dict[tuple, int] = {k: i for i, k in enumerate(existing_keys)}

        updated = existing.copy()
        new_rows: list[pd.Series] = []
        n_added = n_updated = n_unchanged = 0

        for _, inc_row in incoming.iterrows():
            key = tuple(str(inc_row[c]) for c in KEY_COLS)
            if key not in existing_key_index:
                new_rows.append(inc_row)
                n_added += 1
            else:
                ex_i = existing_key_index[key]
                ex_off = updated.at[ex_i, "offboard_date"]
                inc_off = inc_row["offboard_date"]
                ex_current = bool(updated.at[ex_i, "is_current"])
                inc_current = bool(inc_row["is_current"])

                both_null = pd.isna(ex_off) and pd.isna(inc_off)
                same_offboard = both_null or (
                    not pd.isna(ex_off) and not pd.isna(inc_off) and ex_off == inc_off
                )

                if same_offboard and ex_current == inc_current:
                    n_unchanged += 1
                else:
                    updated.at[ex_i, "offboard_date"] = inc_off
                    updated.at[ex_i, "is_current"] = inc_current
                    updated.at[ex_i, "is_date_error"] = bool(inc_row["is_date_error"])
                    n_updated += 1

        if new_rows:
            merged = pd.concat(
                [updated, pd.DataFrame(new_rows)], ignore_index=True
            )
        else:
            merged = updated

    merged = merged.sort_values(
        ["account_manager", "vip_lifecycle_stage", "userid", "onboard_date"], kind="stable"
    ).reset_index(drop=True)

    VIP_ROSTER_PATH.parent.mkdir(parents=True, exist_ok=True)
    merged.to_parquet(VIP_ROSTER_PATH, index=False)

    # Evict cache entry so the next read reloads from the new file
    _PARQUET_CACHE.pop("vip_roster", None)
    _VIP_JOIN_CACHE.clear()
    _VIP_OVERVIEW_CACHE.clear()

    return {
        "ok": True,
        "filename": file.filename,
        "rows_in_file": len(incoming),
        "added": n_added,
        "updated": n_updated,
        "unchanged": n_unchanged,
        "total_in_roster": len(merged),
    }


# ---------------------------------------------------------------------------
# VIP revenue analytics — the VIP universe comes from the uploaded roster
# (vip_roster.parquet). Revenue is computed from RAW betslips + casino wagering
# for those userids over the selected period (actual stakes/winnings), NOT from
# the rfm_users rolling snapshot. This gives correct turnover/GGR/hold per VIP.
# ---------------------------------------------------------------------------
def _join_vip_revenue(
    account_manager: Optional[str],
    stage: Optional[str],
    start: Optional[date],
    end: Optional[date],
    current_only: bool = True,
) -> pd.DataFrame:
    """
    Return one row per current VIP user with period revenue from betslips+casino.

    Columns: userid, account_manager, vip_lifecycle_stage, turnover, ggr,
             sports_stake, casino_stake, casino_ggr, bets
    """
    roster_mtime = VIP_ROSTER_PATH.stat().st_mtime if VIP_ROSTER_PATH.exists() else 0.0
    cache_key = (
        account_manager or "",
        stage or "",
        str(start) if start else "",
        str(end) if end else "",
        bool(current_only),
        int(roster_mtime),
    )
    cached = _VIP_JOIN_CACHE.get(cache_key)
    if cached and _vip_cache_fresh(cached[0]):
        return cached[1].copy()

    roster = _load_vip_roster()
    if roster.empty:
        return pd.DataFrame()

    roster = _apply_vip_filters(roster, account_manager, stage)
    # Keep valid, current stints (one active row per user) as the VIP universe.
    as_of = end or date.today()
    if current_only:
        roster = roster[_vip_active_as_of_mask(roster, as_of)]
    else:
        roster = roster[_vip_overlap_mask(roster, None, None)]
    if roster.empty:
        return pd.DataFrame()

    # One row per user — latest stint wins.
    roster = roster.sort_values(["userid", "onboard_date"]).drop_duplicates(
        subset=["userid"], keep="last"
    )

    # Period for wagering: default to a 30-day window ending at `end` if start absent.
    period_end = end or date.today()
    period_start = start or (period_end - timedelta(days=30))

    vip_ids = set(roster["userid"].dropna().astype("Int64").astype(str))
    wagering = _per_user_wagering(period_start, period_end, vip_ids)

    # Normalise userid to str on both sides before merge
    roster = roster.copy()
    roster["userid"] = roster["userid"].astype(str)

    if wagering.empty:
        merged = roster.copy()
        for c in ["sports_stake", "sports_winnings", "sports_bets",
                  "casino_stake", "casino_winnings", "casino_bets"]:
            merged[c] = 0.0
    else:
        wagering["userid"] = wagering["userid"].astype(str)
        merged = roster.merge(wagering, on="userid", how="left")
        for c in ["sports_stake", "sports_winnings", "sports_bets",
                  "casino_stake", "casino_winnings", "casino_bets"]:
            merged[c] = pd.to_numeric(merged.get(c, 0), errors="coerce").fillna(0.0)

    merged["turnover"]   = merged["sports_stake"] + merged["casino_stake"]
    merged["casino_ggr"] = merged["casino_stake"] - merged["casino_winnings"]
    merged["ggr"]        = (merged["sports_stake"] - merged["sports_winnings"]) + merged["casino_ggr"]
    merged["bets"]       = (merged["sports_bets"] + merged["casino_bets"]).astype(int)
    _VIP_JOIN_CACHE[cache_key] = (time.time(), merged.copy())
    return merged


@router.get("/vip/revenue")
def vip_revenue(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
):
    """Period-active VIP revenue totals (revenue = rolling 30-day from rfm_users)."""
    df = _join_vip_revenue(account_manager, stage, start, end, current_only=True)
    if df.empty:
        return {"has_data": False}

    vip_count   = int(df["userid"].dropna().nunique())
    total_turn  = float(df["turnover"].sum())
    total_ggr   = float(df["ggr"].sum())
    sports_st   = float(df["sports_stake"].sum())
    casino_st   = float(df["casino_stake"].sum())
    days = ((end - start).days + 1) if (start and end) else 30
    days = max(days, 1)

    # VIP conversion rate = VIPs / total players (rfm_users row count is player base)
    rfm = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    total_players = int(rfm["userid"].dropna().nunique()) if not rfm.empty and "userid" in rfm.columns else 0

    stake_base = sports_st + casino_st
    return {
        "has_data": True,
        "vip_count": vip_count,
        "active_vips": vip_count,  # df is already current-only
        "total_turnover": round(total_turn, 2),
        "total_ggr": round(total_ggr, 2),
        "apd": round(total_ggr / days, 2),
        "avg_revenue_per_vip": round(total_ggr / vip_count, 2) if vip_count > 0 else 0.0,
        "vip_conversion_rate": round(vip_count / total_players * 100, 2) if total_players > 0 else 0.0,
        "total_players": total_players,
        "sports_share": round(sports_st / stake_base * 100, 1) if stake_base > 0 else 0.0,
        "casino_share": round(casino_st / stake_base * 100, 1) if stake_base > 0 else 0.0,
        "revenue_basis": "period",
    }


@router.get("/vip/by-manager")
def vip_by_manager(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
):
    """Per-account-manager VIP rollup."""
    df = _join_vip_revenue(account_manager, stage, start, end, current_only=True)
    if df.empty:
        return {"managers": [], "has_data": False}

    rows = []
    for mgr, g in df.groupby("account_manager"):
        vip_count = int(g["userid"].dropna().nunique())
        turn = float(g["turnover"].sum())
        ggr = float(g["ggr"].sum())
        sports = float(g["sports_stake"].sum())
        casino = float(g["casino_stake"].sum())
        base = sports + casino
        rows.append({
            "account_manager": str(mgr),
            "vip_count": vip_count,
            "turnover": round(turn, 2),
            "ggr": round(ggr, 2),
            "avg_revenue_per_vip": round(ggr / vip_count, 2) if vip_count > 0 else 0.0,
            "sports_share": round(sports / base * 100, 1) if base > 0 else 0.0,
            "casino_share": round(casino / base * 100, 1) if base > 0 else 0.0,
        })
    rows.sort(key=lambda r: r["ggr"], reverse=True)
    return {"managers": rows, "has_data": True}


@router.get("/vip/top-players")
def vip_top_players(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=200),
):
    """Top VIPs ranked by turnover (rolling 30-day)."""
    df = _join_vip_revenue(account_manager, stage, start, end, current_only=True)
    if df.empty:
        return {"players": [], "has_data": False}

    d = df.sort_values("turnover", ascending=False).head(limit)
    players = []
    for _, r in d.iterrows():
        players.append({
            "user_id": str(int(r["userid"])) if pd.notna(r["userid"]) else None,
            "account_manager": str(r.get("account_manager", "")),
            "vip_lifecycle_stage": str(r.get("vip_lifecycle_stage", "")),
            "turnover": round(float(r["turnover"]), 2),
            "ggr": round(float(r["ggr"]), 2),
            "bets": int(r["bets"]),
        })
    return {"players": players, "has_data": True}


@router.get("/vip/product-share")
def vip_product_share(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
):
    """Aggregate sports vs casino split across all current VIPs."""
    df = _join_vip_revenue(account_manager, stage, start, end, current_only=True)
    if df.empty:
        return {"has_data": False, "products": []}

    sports_stake = float(df["sports_stake"].sum())
    casino_stake = float(df["casino_stake"].sum())
    sports_ggr   = float(df["ggr"].sum()) - float(df["casino_ggr"].sum())
    casino_ggr   = float(df["casino_ggr"].sum())
    return {
        "has_data": True,
        "products": [
            {"product": "Sports", "stake": round(sports_stake, 2), "ggr": round(sports_ggr, 2)},
            {"product": "Casino", "stake": round(casino_stake, 2), "ggr": round(casino_ggr, 2)},
        ],
    }


@router.get("/vip/demographics")
def vip_demographics(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
):
    """
    VIP demographics: age-band and country distribution for current VIPs.
    Age derived from view_Users.BirthDate. Gender is not available in the DWH.
    """
    roster = _load_vip_roster()
    if roster.empty:
        return {"has_data": False, "age_bands": [], "countries": []}

    roster = _apply_vip_filters(roster, account_manager, stage)
    as_of = end or date.today()
    roster = roster[_vip_active_as_of_mask(roster, as_of)]
    if roster.empty:
        return {"has_data": False, "age_bands": [], "countries": []}

    roster = roster.sort_values(["userid", "onboard_date"]).drop_duplicates(subset=["userid"], keep="last")

    details = _load_vip_user_details()
    if details.empty:
        return {"has_data": False, "age_bands": [], "countries": []}
    d = roster.merge(details, on="userid", how="left")

    # ── Age bands from birthdate ──────────────────────────────────────────────
    age_bands: list[dict] = []
    if "birthdate" in d.columns:
        bdate = pd.to_datetime(d["birthdate"], errors="coerce")
        today = pd.Timestamp(as_of)
        age = ((today - bdate).dt.days / 365.25)
        bins = [0, 25, 35, 45, 55, 200]
        labels = ["18-24", "25-34", "35-44", "45-54", "55+"]
        age_cat = pd.cut(age.dropna(), bins=bins, labels=labels, right=False)
        counts = age_cat.value_counts().reindex(labels, fill_value=0)
        age_bands = [{"band": str(b), "count": int(c)} for b, c in counts.items()]

    # ── Country distribution ──────────────────────────────────────────────────
    countries: list[dict] = []
    if "country" in d.columns:
        cc = d["country"].fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
        c_counts = cc.value_counts().head(10)
        countries = [{"country": str(k), "count": int(v)} for k, v in c_counts.items()]

    return {
        "has_data": True,
        "age_bands": age_bands,
        "countries": countries,
        "gender_available": False,
    }


@router.get("/vip/trends")
def vip_trends(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
):
    """31-day daily NGR/GGR/Turnover/Margin trend for VIP players."""
    from backend.core.cache import VIP_REVENUE_DAILY_PATH
    if not VIP_REVENUE_DAILY_PATH.exists():
        return {"has_data": False, "points": []}

    roster = _load_vip_roster()
    if roster.empty:
        return {"has_data": False, "points": []}
    roster = _apply_vip_filters(roster, account_manager, stage)
    vip_ids = set(roster["userid"].astype(str).unique())

    df = load_parquet_cached(VIP_REVENUE_DAILY_PATH, "vip_revenue_daily")
    df = df[df["userid"].astype(str).isin(vip_ids)]
    df["_date"] = pd.to_datetime(df["date"]).dt.date
    df = _filter_range(df, start, end)
    if df.empty:
        return {"has_data": False, "points": []}

    for c in ["sports_stake", "sports_winnings", "casino_stake", "casino_winnings",
              "sports_bets", "casino_bets"]:
        if c not in df.columns:
            df[c] = 0.0

    daily = df.groupby("_date").agg(
        sports_stake=("sports_stake", "sum"),
        sports_winnings=("sports_winnings", "sum"),
        casino_stake=("casino_stake", "sum"),
        casino_winnings=("casino_winnings", "sum"),
        sports_bets=("sports_bets", "sum"),
        casino_bets=("casino_bets", "sum"),
    ).reset_index().sort_values("_date")

    points = []
    for _, r in daily.iterrows():
        turnover = float(r["sports_stake"]) + float(r["casino_stake"])
        ggr      = (float(r["sports_stake"]) - float(r["sports_winnings"])) + \
                   (float(r["casino_stake"]) - float(r["casino_winnings"]))
        margin   = round(ggr / turnover * 100, 2) if turnover > 0 else 0.0
        points.append({
            "date":     str(r["_date"]),
            "turnover": round(turnover, 2),
            "ggr":      round(ggr, 2),
            "margin":   margin,
            "bets":     int(r["sports_bets"]) + int(r["casino_bets"]),
        })

    return {"has_data": True, "points": points}


@router.get("/vip/monthly")
def vip_monthly(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
):
    """6-month performance — one row per calendar month."""
    from backend.core.cache import VIP_REVENUE_DAILY_PATH
    if not VIP_REVENUE_DAILY_PATH.exists():
        return {"has_data": False, "months": []}

    roster = _load_vip_roster()
    if roster.empty:
        return {"has_data": False, "months": []}
    roster = _apply_vip_filters(roster, account_manager, stage)
    vip_ids = set(roster["userid"].astype(str).unique())

    df = load_parquet_cached(VIP_REVENUE_DAILY_PATH, "vip_revenue_daily")
    df = df[df["userid"].astype(str).isin(vip_ids)]
    df["_date"] = pd.to_datetime(df["date"])

    # Default: last 6 months if no range given
    if end is None:
        end = date.today()
    if start is None:
        start = date(end.year - 1 if end.month <= 6 else end.year, (end.month - 6) % 12 + 1, 1)
    df = df[(df["_date"].dt.date >= start) & (df["_date"].dt.date <= end)]
    if df.empty:
        return {"has_data": False, "months": []}

    df["_month"] = df["_date"].dt.to_period("M").astype(str)
    for c in ["sports_stake", "sports_winnings", "casino_stake", "casino_winnings",
              "sports_bets", "casino_bets"]:
        if c not in df.columns:
            df[c] = 0.0

    monthly = df.groupby("_month").agg(
        sports_stake=("sports_stake", "sum"),
        sports_winnings=("sports_winnings", "sum"),
        casino_stake=("casino_stake", "sum"),
        casino_winnings=("casino_winnings", "sum"),
        sports_bets=("sports_bets", "sum"),
        casino_bets=("casino_bets", "sum"),
        active_vips=("userid", "nunique"),
    ).reset_index().sort_values("_month")

    months = []
    for _, r in monthly.iterrows():
        turnover = float(r["sports_stake"]) + float(r["casino_stake"])
        ggr      = (float(r["sports_stake"]) - float(r["sports_winnings"])) + \
                   (float(r["casino_stake"]) - float(r["casino_winnings"]))
        margin   = round(ggr / turnover * 100, 2) if turnover > 0 else 0.0
        months.append({
            "month":       str(r["_month"]),
            "turnover":    round(turnover, 2),
            "ggr":         round(ggr, 2),
            "margin":      margin,
            "bets":        int(r["sports_bets"]) + int(r["casino_bets"]),
            "active_vips": int(r["active_vips"]),
        })

    return {"has_data": True, "months": months}


@router.get("/vip/hourly")
def vip_hourly(
    start: Optional[date] = Query(None),
    end:   Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
):
    """Hourly betting activity pattern for VIP players (aggregated across selected period)."""
    from backend.core.cache import load_betslips_raw, load_casino_raw
    from src.kpis.io_utils import normalize_cols, to_dt

    roster = _load_vip_roster()
    if roster.empty:
        return {"has_data": False, "hours": []}
    roster = _apply_vip_filters(roster, account_manager, stage)
    vip_ids = set(roster["userid"].astype(str).unique())

    def _hourly_from(raw_df: pd.DataFrame) -> pd.DataFrame:
        empty = pd.DataFrame(columns=["hour", "bets", "turnover"])
        if raw_df.empty:
            return empty
        df, col = normalize_cols(raw_df)
        placement = col.get("placementdate") or col.get("placedate") or col.get("betdate") or col.get("date")
        user_col  = col.get("userid")
        stake_col = col.get("stake")
        if not placement or not user_col:
            return empty
        df["_dt"] = to_dt(df[placement])
        df["_date"] = df["_dt"].dt.date
        df = _filter_range(df, start, end)
        df = df[df[user_col].astype(str).isin(vip_ids)]
        if df.empty:
            return empty
        df["_hour"] = df["_dt"].dt.hour
        df["_stake"] = pd.to_numeric(df[stake_col], errors="coerce").fillna(0.0) if stake_col else 0.0
        return df.groupby("_hour").agg(bets=("_hour", "size"), turnover=("_stake", "sum")).reset_index().rename(columns={"_hour": "hour"})

    sports = _hourly_from(load_betslips_raw())
    casino = _hourly_from(load_casino_raw())

    # Merge both on hour 0-23
    hours_df = pd.DataFrame({"hour": range(24)})
    if not sports.empty:
        hours_df = hours_df.merge(sports.rename(columns={"bets": "sports_bets", "turnover": "sports_stake"}), on="hour", how="left")
    if not casino.empty:
        hours_df = hours_df.merge(casino.rename(columns={"bets": "casino_bets", "turnover": "casino_stake"}), on="hour", how="left")
    for c in ["sports_bets", "sports_stake", "casino_bets", "casino_stake"]:
        if c not in hours_df.columns:
            hours_df[c] = 0.0
    hours_df = hours_df.fillna(0)

    result = [
        {
            "hour":         int(r["hour"]),
            "label":        f"{int(r['hour']):02d}:00",
            "bets":         int(r["sports_bets"]) + int(r["casino_bets"]),
            "sports_bets":  int(r["sports_bets"]),
            "casino_bets":  int(r["casino_bets"]),
            "turnover":     round(float(r["sports_stake"]) + float(r["casino_stake"]), 2),
        }
        for _, r in hours_df.iterrows()
    ]

    return {"has_data": any(h["bets"] > 0 for h in result), "hours": result}


@router.get("/vip/overview")
def vip_overview(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    account_manager: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    include_demographics: bool = Query(False),
):
    """
    Consolidated VIP endpoint for UI loading stability.

    Computes all VIP sections in one request so the frontend isn't blocked by
    multiple heavy calls against raw wagering files.
    """
    roster_mtime = VIP_ROSTER_PATH.stat().st_mtime if VIP_ROSTER_PATH.exists() else 0.0
    ov_key = (
        str(start) if start else "",
        str(end) if end else "",
        account_manager or "",
        stage or "",
        bool(include_demographics),
        int(roster_mtime),
    )
    ov_cached = _VIP_OVERVIEW_CACHE.get(ov_key)
    if ov_cached and _vip_cache_fresh(ov_cached[0]):
        return ov_cached[1]

    summary = vip_summary(start=start, end=end, account_manager=account_manager, stage=stage)

    df = _join_vip_revenue(account_manager, stage, start, end, current_only=True)
    if df.empty:
        out = {
            "summary": summary,
            "revenue": {"has_data": False},
            "managers": {"managers": [], "has_data": False},
            "top_players": {"players": [], "has_data": False},
            "product_share": {"has_data": False, "products": []},
            "demographics": {"has_data": False, "age_bands": [], "countries": [], "gender_available": False},
        }
        _VIP_OVERVIEW_CACHE[ov_key] = (time.time(), out)
        return out

    vip_count = int(df["userid"].dropna().nunique())
    total_turn = float(df["turnover"].sum())
    total_ggr = float(df["ggr"].sum())
    sports_st = float(df["sports_stake"].sum())
    casino_st = float(df["casino_stake"].sum())
    days = ((end - start).days + 1) if (start and end) else 30
    days = max(days, 1)

    rfm = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    total_players = int(rfm["userid"].dropna().nunique()) if not rfm.empty and "userid" in rfm.columns else 0
    stake_base = sports_st + casino_st
    revenue = {
        "has_data": True,
        "vip_count": vip_count,
        "active_vips": vip_count,
        "total_turnover": round(total_turn, 2),
        "total_ggr": round(total_ggr, 2),
        "apd": round(total_ggr / days, 2),
        "avg_revenue_per_vip": round(total_ggr / vip_count, 2) if vip_count > 0 else 0.0,
        "vip_conversion_rate": round(vip_count / total_players * 100, 2) if total_players > 0 else 0.0,
        "total_players": total_players,
        "sports_share": round(sports_st / stake_base * 100, 1) if stake_base > 0 else 0.0,
        "casino_share": round(casino_st / stake_base * 100, 1) if stake_base > 0 else 0.0,
        "revenue_basis": "period",
    }

    mgr_rows = []
    for mgr, g in df.groupby("account_manager"):
        m_vip = int(g["userid"].dropna().nunique())
        m_turn = float(g["turnover"].sum())
        m_ggr = float(g["ggr"].sum())
        m_sports = float(g["sports_stake"].sum())
        m_casino = float(g["casino_stake"].sum())
        m_base = m_sports + m_casino
        mgr_rows.append({
            "account_manager": str(mgr),
            "vip_count": m_vip,
            "turnover": round(m_turn, 2),
            "ggr": round(m_ggr, 2),
            "avg_revenue_per_vip": round(m_ggr / m_vip, 2) if m_vip > 0 else 0.0,
            "sports_share": round(m_sports / m_base * 100, 1) if m_base > 0 else 0.0,
            "casino_share": round(m_casino / m_base * 100, 1) if m_base > 0 else 0.0,
        })
    mgr_rows.sort(key=lambda r: r["ggr"], reverse=True)

    top_df = df.sort_values("turnover", ascending=False).head(20)
    players = []
    for _, r in top_df.iterrows():
        players.append({
            "user_id": str(int(r["userid"])) if pd.notna(r["userid"]) else None,
            "account_manager": str(r.get("account_manager", "")),
            "vip_lifecycle_stage": str(r.get("vip_lifecycle_stage", "")),
            "turnover": round(float(r["turnover"]), 2),
            "ggr": round(float(r["ggr"]), 2),
            "bets": int(r["bets"]),
        })

    sports_ggr = float(df["ggr"].sum()) - float(df["casino_ggr"].sum())
    casino_ggr = float(df["casino_ggr"].sum())
    product_share = {
        "has_data": True,
        "products": [
            {"product": "Sports", "stake": round(sports_st, 2), "ggr": round(sports_ggr, 2)},
            {"product": "Casino", "stake": round(casino_st, 2), "ggr": round(casino_ggr, 2)},
        ],
    }

    age_bands: list[dict] = []
    countries: list[dict] = []
    if include_demographics:
        details = _load_vip_user_details()
        if not details.empty:
            dd = df[["userid"]].drop_duplicates().merge(details, on="userid", how="left")
            if "birthdate" in dd.columns:
                bdate = pd.to_datetime(dd["birthdate"], errors="coerce")
                today = pd.Timestamp(end or date.today())
                age = ((today - bdate).dt.days / 365.25)
                bins = [0, 25, 35, 45, 55, 200]
                labels = ["18-24", "25-34", "35-44", "45-54", "55+"]
                age_cat = pd.cut(age.dropna(), bins=bins, labels=labels, right=False)
                counts = age_cat.value_counts().reindex(labels, fill_value=0)
                age_bands = [{"band": str(b), "count": int(c)} for b, c in counts.items()]
            if "country" in dd.columns:
                cc = dd["country"].fillna("Unknown").astype(str).str.strip().replace("", "Unknown")
                c_counts = cc.value_counts().head(10)
                countries = [{"country": str(k), "count": int(v)} for k, v in c_counts.items()]

    demographics = {
        "has_data": bool(include_demographics),
        "age_bands": age_bands,
        "countries": countries,
        "gender_available": False,
    }

    out = {
        "summary": summary,
        "revenue": revenue,
        "managers": {"managers": mgr_rows, "has_data": True},
        "top_players": {"players": players, "has_data": True},
        "product_share": product_share,
        "demographics": demographics,
    }
    _VIP_OVERVIEW_CACHE[ov_key] = (time.time(), out)
    return out


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
