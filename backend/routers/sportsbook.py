"""
routers/sportsbook.py — Sportsbook KPI and betslip endpoints.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import pandas as pd

from fastapi import APIRouter, Query

from src.kpis.io_utils import normalize_cols, to_dt
from backend.core.cache import (
    DAILY_KPIS_PATH,
    load_parquet_cached,
    load_betslips_raw,
)
from backend.core.helpers import (
    _filter_range,
    _s,
    _i,
)
from backend.core.filters import (
    _get_allowed_user_ids,
    _aggregate_betslips_for_users,
)

router = APIRouter()


@router.get("/sportsbook/kpis")
def sportsbook_kpis(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    df = _filter_range(load_parquet_cached(DAILY_KPIS_PATH, "daily_kpis"), start, end)
    if df.empty:
        return {"settled_stake": 0, "winnings": 0, "ggr": 0, "betslips": 0}
    allowed_ids = _get_allowed_user_ids(territory, country, None, current_segment)
    if allowed_ids is not None:
        bs = _aggregate_betslips_for_users(start, end, allowed_ids)
        return {
            "settled_stake": round(bs["stake"], 2),
            "winnings": round(bs["winnings"], 2),
            "ggr": round(bs["ggr"], 2),
            "betslips": bs["betslips"],
        }
    stake = _s(df, "placed_stake") or _s(df, "settled_stake")
    winnings = _s(df, "settled_winnings")
    ggr = _s(df, "ggr")
    betslips = _i(df, "betslips_count")
    return {
        "settled_stake": round(stake, 2),
        "winnings": round(winnings, 2),
        "ggr": round(ggr, 2),
        "betslips": betslips,
    }


@router.get("/betting/betslips-by-status")
def betslips_by_status(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    df = load_betslips_raw()
    if df.empty:
        return []
    df, bcol = normalize_cols(df)
    status_col = bcol.get("betslipstatus") or bcol.get("status") or bcol.get("betslipstatusid") or bcol.get("statusid")
    status_id_col = bcol.get("betslipstatusid") or bcol.get("statusid")
    placement_col = bcol.get("placementdate") or bcol.get("placedate") or bcol.get("betdate") or bcol.get("date")
    user_id_col = bcol.get("userid")
    if not status_col or not placement_col:
        return []
    df["_date"] = to_dt(df[placement_col]).dt.date
    df = _filter_range(df, start, end)
    if df.empty:
        return []
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
    if allowed_ids is not None and user_id_col:
        df = df[df[user_id_col].astype(str).isin(allowed_ids)]
        if df.empty:
            return []
    grouped = df.groupby(status_col).size().reset_index(name="count")
    if status_id_col and status_id_col in df.columns and status_id_col != status_col:
        id_map = df[[status_col, status_id_col]].dropna().drop_duplicates()
        grouped = grouped.merge(id_map, on=status_col, how="left")
    rows = []
    for _, r in grouped.iterrows():
        status_val = r[status_col]
        status = str(status_val) if pd.notna(status_val) else "Unknown"
        status_id = None
        if status_id_col and status_id_col in r.index:
            try:
                status_id = int(r[status_id_col]) if pd.notna(r[status_id_col]) else None
            except Exception:
                status_id = None
        rows.append({"status": status, "statusId": status_id, "count": int(r["count"])})
    return rows


@router.get("/betting/betslips-by-type")
def betslips_by_type(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    df = load_betslips_raw()
    if df.empty:
        return []
    df, bcol = normalize_cols(df)
    type_col = bcol.get("betsliptype") or bcol.get("betsliptypeid") or bcol.get("bettype") or bcol.get("bettypeid") or bcol.get("type")
    type_id_col = bcol.get("betsliptypeid") or bcol.get("bettypeid")
    placement_col = bcol.get("placementdate") or bcol.get("placedate") or bcol.get("betdate") or bcol.get("date")
    user_id_col = bcol.get("userid")
    if not type_col or not placement_col:
        return []
    df["_date"] = to_dt(df[placement_col]).dt.date
    df = _filter_range(df, start, end)
    if df.empty:
        return []
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
    if allowed_ids is not None and user_id_col:
        df = df[df[user_id_col].astype(str).isin(allowed_ids)]
        if df.empty:
            return []
    grouped = df.groupby(type_col).size().reset_index(name="count")
    if type_id_col and type_id_col in df.columns and type_id_col != type_col:
        id_map = df[[type_col, type_id_col]].dropna().drop_duplicates()
        grouped = grouped.merge(id_map, on=type_col, how="left")
    rows = []
    for _, r in grouped.iterrows():
        type_val = r[type_col]
        type_name = str(type_val) if pd.notna(type_val) else "Unknown"
        type_id = None
        if type_id_col and type_id_col in r.index:
            try:
                type_id = int(r[type_id_col]) if pd.notna(r[type_id_col]) else None
            except Exception:
                type_id = None
        rows.append({"type": type_name, "typeId": type_id, "count": int(r["count"])})
    return rows
