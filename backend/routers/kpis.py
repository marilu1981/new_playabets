"""
routers/kpis.py — KPI endpoints and time-series endpoints.
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Literal

import pandas as pd

from fastapi import APIRouter, HTTPException, Query

from src.app_config import ENABLE_TRANSACTIONS
from backend.core.cache import (
    DATA_PATH,
    RFM_USERS_PATH,
    RFM_ROLLING_PATH,
    RFM_MONTHLY_PATH,
    FTD_DAILY_PATH,
    FTD_REG_MONTH_DAILY_PATH,
    FTD_NEW_DEP_DAILY_PATH,
    BONUS_DAILY_PATH,
    CASINO_DAILY_PATH,
    ACTIVES_MONTHLY_PATH,
    SELFEXCLUSIONS_PATH,
    load_parquet_cached,
    load_daily_df,
)
from backend.core.helpers import (
    _filter_range,
    _s,
    _i,
    _mean_i,
    _get_taxes_paid,
    _get_churn_pct,
    _get_monthly_depositors,
    _get_total_actives,
    _load_transactions_df,
    _summary_period,
)
from backend.core.filters import (
    _normalize_value,
    _get_allowed_user_ids,
    _aggregate_betslips_for_users,
    _filtered_registration_counts,
    _filtered_registration_total,
    _build_conversion_cohorts,
)

router = APIRouter()

_SAST = timezone(timedelta(hours=2))


@router.get("/kpis")
def kpis(
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)

    df = _filter_range(load_daily_df(), start, end)
    tx = _load_transactions_df(start, end)
    bonus = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)
    ftd = _filter_range(load_parquet_cached(FTD_DAILY_PATH, "ftd_daily"), start, end)
    casino = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)

    # When user/segment filter active, re-aggregate sportsbook metrics from raw betslips
    if allowed_ids is not None:
        bs = _aggregate_betslips_for_users(start, end, allowed_ids)
        sportsbook_turnover = bs["stake"]
        sportsbook_winnings = bs["winnings"]
        sportsbook_ggr = bs["ggr"]
        sportsbook_actives = 0  # cannot derive actives from betslip filter alone
    else:
        sportsbook_turnover_real  = _s(df, "placed_stake")
        sportsbook_turnover_bonus = _s(df, "placed_stake_bonus")
        sportsbook_turnover = sportsbook_turnover_real + sportsbook_turnover_bonus
        sportsbook_winnings = _s(df, "settled_winnings")
        sportsbook_ggr = _s(df, "ggr_total") or _s(df, "ggr")  # total GGR
        sportsbook_actives = _mean_i(df, "actives_sports")

    # Horse racing (Betmakers) is separated from casino — add to sports totals.
    horse_racing_ggr   = _s(casino, "horse_racing_ggr")
    horse_racing_stake = _s(casino, "horse_racing_stake")
    sportsbook_ggr     += horse_racing_ggr
    sportsbook_turnover += horse_racing_stake

    casino_turnover     = _s(casino, "casino_total_stake") or _s(casino, "casino_stake")  # real + bonus
    casino_ggr_display  = _s(casino, "casino_total_ggr")  or _s(casino, "casino_ggr")   # real + bonus GGR
    casino_ggr          = _s(casino, "casino_ggr")                                        # real money only
    casino_winnings     = _s(casino, "casino_winnings")

    # Period-unique actives from actives_monthly.parquet (falls back to daily avg).
    actives_monthly = load_parquet_cached(ACTIVES_MONTHLY_PATH, "actives_monthly")
    if not actives_monthly.empty and "month" in actives_monthly.columns:
        start_month = start.strftime("%Y-%m")
        end_month = end.strftime("%Y-%m")
        mask = (actives_monthly["month"] >= start_month) & (actives_monthly["month"] <= end_month)
        am = actives_monthly[mask]
        sportsbook_actives = int(am["sports_actives_unique"].sum()) if "sports_actives_unique" in am.columns and not am.empty else sportsbook_actives
        casino_actives = int(am["casino_actives_unique"].sum()) if "casino_actives_unique" in am.columns and not am.empty else _mean_i(casino, "casino_actives")
    else:
        casino_actives = _mean_i(casino, "casino_actives")

    # Average Play Days (APD): total wagering user-days (sports + casino) / total unique actives.
    # sum(daily_actives) over period = total (user, day) wagering events for that vertical.
    sports_user_days = _s(df, "actives_sports")
    casino_user_days = _s(casino, "casino_actives")
    total_actives_unique = _get_total_actives(start, end)
    total_apd = round((sports_user_days + casino_user_days) / total_actives_unique, 1) if total_actives_unique > 0 else 0.0

    lotto_ggr_main   = _s(casino, "lotto_ggr")
    lotto_stake_main = _s(casino, "lotto_stake")
    turnover = sportsbook_turnover + casino_turnover + lotto_stake_main    # incl lotto
    real_money_turnover = sportsbook_turnover_real + _s(casino, "casino_stake") + horse_racing_stake + lotto_stake_main
    bonus_money_turnover = sportsbook_turnover_bonus + _s(casino, "casino_bonus_stake")
    winnings = sportsbook_winnings + casino_winnings
    taxes_paid = _get_taxes_paid(start, end)
    casino_bonus_ggr = _s(casino, "casino_bonus_ggr")
    # GGR = Real Money GGR + Bonus Money GGR - Taxes Paid By User (client formula)
    ggr = sportsbook_ggr + casino_ggr_display + lotto_ggr_main - taxes_paid   # incl lotto, net of taxes
    # real_money_ggr = sports(real) + horse_racing + casino(real) + lotto (lotto is real-money only)
    ggr_real = (_s(df, "ggr") + horse_racing_ggr) + casino_ggr            # pre-tax, excl lotto
    real_money_ggr_display = ggr_real + lotto_ggr_main - taxes_paid       # displayed: incl lotto, net of taxes (client formula)
    bonus_money_ggr = (sportsbook_ggr - _s(df, "ggr") - horse_racing_ggr) + casino_bonus_ggr
    bonus_spent = _s(bonus, "bonus_total") or _s(bonus, "bonus_credited")
    freebet_issued = _s(bonus, "freebet_issued")
    freebet_spend  = _s(bonus, "freebet_spend")
    bonus_converted = _s(tx, "bonus_redeemed")
    ngr = real_money_ggr_display - (bonus_converted if bonus_converted > 0 else bonus_spent)

    # FTD Reg Month: users who registered in period AND have ever deposited (lifetime).
    ftd_reg_month_df = _filter_range(load_parquet_cached(FTD_REG_MONTH_DAILY_PATH, "ftd_reg_month_daily"), start, end)
    ftd_reg_month = _i(ftd_reg_month_df, "ftd_reg_month")
    # FTD New Depositors: registered AND first deposited in same period — matches client's report.
    ftd_new_dep = _filter_range(load_parquet_cached(FTD_NEW_DEP_DAILY_PATH, "ftd_new_dep_daily"), start, end)
    ftd_new_depositors = _i(ftd_new_dep, "ftd_new_depositors")

    filtered_registrations = _filtered_registration_total(start, end, territory, country, customer_status, current_segment) if allowed_ids is not None else None

    return {
        "range": {"start": str(start), "end": str(end)},
        "registrations": filtered_registrations if filtered_registrations is not None else _i(df, "registrations"),
        "actives": sportsbook_actives + casino_actives,
        "sports_actives": sportsbook_actives,
        "casino_actives": casino_actives,
        "turnover": turnover,
        "real_money_turnover": round(real_money_turnover, 2),
        "bonus_money_turnover": round(bonus_money_turnover, 2),
        "winnings": winnings,
        "ggr": ggr,
        "real_money_ggr": round(real_money_ggr_display, 2),
        "bonus_money_ggr": round(bonus_money_ggr, 2),
        "ngr": ngr,
        "bonus_spent": bonus_spent,
        "freebet_spend": freebet_spend,
        "sportsbook_turnover": sportsbook_turnover,
        "sportsbook_winnings": sportsbook_winnings,
        "sportsbook_ggr": sportsbook_ggr,
        "casino_turnover": casino_turnover,
        "casino_winnings": casino_winnings,
        "casino_ggr": casino_ggr,
        # Horse racing standalone fields (absorbed into sportsbook totals above,
        # but exposed separately so the Product dashboard can show them per vertical)
        "horse_racing_ggr": round(horse_racing_ggr, 2),
        "horse_racing_stake": round(horse_racing_stake, 2),
        "horse_racing_bets": _i(casino, "horse_racing_bets"),
        "horse_racing_actives": _i(casino, "horse_racing_actives"),
        # FTDs: users whose globally earliest deposit falls in the queried period.
        # ftd_reg_month: users who *registered* in the period and have ever deposited.
        # These differ by ~4% because some users register before the period and deposit later.
        "ftds": _i(ftd, "ftds"),
        "ftd_reg_month": ftd_reg_month,
        "ftd_new_depositors": ftd_new_depositors,
        "deposits": _s(tx, "deposits"),
        "withdrawals": _s(tx, "withdrawals"),
        "net_deposits": _s(tx, "net_deposits"),
        "bonus_spent": bonus_spent,
        "bonus_redeemed": _s(tx, "bonus_redeemed"),
        "bonus_issued_tx": _s(tx, "bonus_issued"),
        "bonus_net": _s(tx, "bonus_net"),
        "bonus_tx_issued": _s(bonus, "bonus_tx_issued"),
        "bonus_tx_reversed": _s(bonus, "bonus_tx_reversed"),
        "bonus_tx_net": _s(bonus, "bonus_tx_net"),
        "bonus_pct": round(_s(tx, "bonus_redeemed") / _s(bonus, "bonus_tx_net") * 100, 1) if _s(bonus, "bonus_tx_net") > 0 else 0.0,
        "unique_depositors": _i(tx, "unique_depositors"),
        "churn_pct": _get_churn_pct(end),
        "taxes_paid": taxes_paid,
        "total_apd": total_apd,
        "total_actives_unique": total_actives_unique,
        "period_unique_depositors": _get_monthly_depositors(start, end),
        "has_transactions_data": ENABLE_TRANSACTIONS and not tx.empty,
        "transactions_enabled": ENABLE_TRANSACTIONS,
        "filters_applied": {
            "territory": bool(_normalize_value(territory)),
            "country": bool(_normalize_value(country)),
            "customer_status": bool(_normalize_value(customer_status)),
            "current_segment": bool(_normalize_value(current_segment)),
            "registrations_filtered": filtered_registrations is not None,
        },
    }


@router.get("/kpis/latest")
def kpis_latest():
    df = load_daily_df()
    if df.empty:
        raise HTTPException(404, "KPI table is empty")
    row = df.iloc[-1].to_dict()
    result = {k: (str(v) if k == "date" else (v.item() if hasattr(v, "item") else v)) for k, v in row.items()}
    if DATA_PATH.exists():
        mtime = DATA_PATH.stat().st_mtime
        sast_dt = datetime.fromtimestamp(mtime, tz=_SAST)
        result["last_updated"] = sast_dt.strftime("%Y-%m-%d %H:%M SAST")
    return result


@router.get("/kpis/series")
def kpis_series(
    metric: str = Query(...),
    days: int = Query(30, ge=1, le=400),
):
    df = load_daily_df()
    if metric not in df.columns:
        raise HTTPException(400, f"Unknown metric '{metric}'. Available: {list(df.columns)}")
    tail_df = df.tail(days)
    return {
        "metric": metric,
        "days": days,
        "points": [
            {"date": str(dt), "value": float(v) if pd.notna(v) else None}
            for dt, v in zip(tail_df["date"], tail_df[metric])
        ],
    }


@router.get("/kpis/rolling")
def kpis_rolling(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    limit: int = Query(180, ge=1, le=2000),
):
    df = load_parquet_cached(RFM_ROLLING_PATH, "rfm_rolling_daily")
    if df.empty:
        return {"path": str(RFM_ROLLING_PATH), "rows": []}
    d = df
    if start and end and "date" in d.columns:
        d = _filter_range(d, start, end).sort_values("date")
    elif "date" in d.columns:
        d = d.sort_values("date").tail(limit)
    return {"path": str(RFM_ROLLING_PATH), "rows": d.to_dict(orient="records")}


@router.get("/kpis/daily")
def kpis_daily(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    metrics: Optional[str] = Query(None),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    df = load_daily_df()
    if df.empty:
        return {"path": str(DATA_PATH), "rows": []}
    d = df.copy()
    if start and end and "date" in d.columns:
        d = _filter_range(d, start, end)
        allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
        if allowed_ids is not None:
            regs_by_date = _filtered_registration_counts(start, end, territory, country, customer_status, current_segment)
            d["registrations"] = d["date"].map(lambda x: int(regs_by_date.get(x, 0)))
    d = d.sort_values("date")
    if metrics:
        wanted = [c.strip() for c in metrics.split(",") if c.strip()]
        keep = ["date"] + [c for c in wanted if c in d.columns and c != "date"]
        if keep:
            d = d[keep]
    return {"path": str(DATA_PATH), "rows": d.to_dict(orient="records")}


@router.get("/kpis/summary")
def kpis_summary(
    start: date = Query(...),
    end: date = Query(...),
    previous_start: Optional[date] = Query(None),
    previous_end: Optional[date] = Query(None),
    ytd_start: Optional[date] = Query(None),
):
    # Auto-compute previous period (same duration shifted back) if not provided
    if previous_start is None or previous_end is None:
        duration = (end - start).days
        previous_end = start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=duration)

    # Auto-compute YTD (Jan 1 of end year → end) if not provided
    if ytd_start is None:
        ytd_start = date(end.year, 1, 1)

    current = _summary_period(start, end)
    previous = _summary_period(previous_start, previous_end)
    ytd = _summary_period(ytd_start, end)

    # RFM snapshot (latest)
    rfm_df = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    rfm = {"vip": 0, "active": 0, "new": 0, "cooling": 0, "lapsed": 0, "dormant": 0}
    if not rfm_df.empty and "segment" in rfm_df.columns:
        counts = rfm_df["segment"].fillna("Unknown").value_counts().to_dict()
        rfm = {
            "vip": int(counts.get("VIP", 0)),
            "active": int(counts.get("Active", 0)),
            "new": int(counts.get("New", 0)),
            "cooling": int(counts.get("Cooling", 0)),
            "lapsed": int(counts.get("Lapsed", 0)),
            "dormant": int(counts.get("Dormant", 0)),
        }

    self_ex_total = 0
    if SELFEXCLUSIONS_PATH.exists():
        ex_df = load_parquet_cached(SELFEXCLUSIONS_PATH, "selfexclusions")
        self_ex_total = len(ex_df)

    return {
        "current": current,
        "previous": previous,
        "ytd": ytd,
        "rfm": rfm,
        "self_exclusions": self_ex_total,
        "periods": {
            "current": {"start": str(start), "end": str(end)},
            "previous": {"start": str(previous_start), "end": str(previous_end)},
            "ytd": {"start": str(ytd_start), "end": str(end)},
        },
    }


@router.get("/timeseries/revenue")
def revenue_timeseries(
    start: date = Query(...),
    end: date = Query(...),
    metric: Literal["turnover", "ggr", "registrations", "actives_sports"] = Query("ggr"),
):
    df = load_daily_df()
    if metric not in df.columns:
        raise HTTPException(400, f"Unknown metric '{metric}'")
    d = _filter_range(df, start, end).sort_values("date")
    return {
        "metric": metric,
        "points": [
            {"date": str(dt), "value": float(v) if pd.notna(v) else None}
            for dt, v in zip(d["date"], d[metric])
        ],
    }


@router.get("/timeseries/registrations")
def registrations_timeseries(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
    if allowed_ids is not None:
        counts = _filtered_registration_counts(start, end, territory, country, customer_status, current_segment)
        dates = pd.date_range(start, end, freq="D").date
        regs = [{"date": str(d), "value": int(counts.get(d, 0))} for d in dates]
        ftds = [{"date": str(d), "value": 0} for d in dates]
        return {"registrations": regs, "ftds": ftds, "filters_applied": True}

    df = load_daily_df()
    ftd = load_parquet_cached(FTD_DAILY_PATH, "ftd_daily")
    d = _filter_range(df, start, end).sort_values("date")
    f = _filter_range(ftd, start, end).sort_values("date")

    ftd_by_date: dict[date, int] = {}
    if not f.empty and "date" in f.columns and "ftds" in f.columns:
        ftd_by_date = dict(zip(f["date"], f["ftds"].fillna(0).astype(int)))

    regs = [{"date": str(x), "value": int(v)} for x, v in zip(d["date"], d.get("registrations", [0] * len(d)))]
    ftds = [{"date": str(x), "value": int(ftd_by_date.get(x, 0))} for x in d["date"]]
    return {"registrations": regs, "ftds": ftds, "filters_applied": False}


@router.get("/timeseries/conversion-cohorts")
def conversion_cohorts_timeseries(
    start: date = Query(...),
    end: date = Query(...),
):
    cohorts, max_observed_date = _build_conversion_cohorts()
    if cohorts.empty:
        return {"points": [], "max_observed_date": None}

    d = cohorts[(cohorts["date"] >= start) & (cohorts["date"] <= end)].sort_values("date")
    records = d.to_dict("records")
    return {
        "max_observed_date": str(max_observed_date) if max_observed_date else None,
        "points": [
            {
                "date": str(r["date"]),
                "registrations": int(r.get("registrations", 0) or 0),
                "ftds_d7": int(r.get("ftds_d7", 0) or 0),
                "ftds_d30": int(r.get("ftds_d30", 0) or 0),
                "rate_d7": (float(r["rate_d7"]) if pd.notna(r.get("rate_d7")) else None),
                "rate_d30": (float(r["rate_d30"]) if pd.notna(r.get("rate_d30")) else None),
            }
            for r in records
        ],
    }


@router.get("/ftd/daily")
def ftd_daily(
    start: date = Query(...),
    end: date = Query(...),
):
    ftd = _filter_range(load_parquet_cached(FTD_DAILY_PATH, "ftd_daily"), start, end)
    if ftd.empty:
        return {"points": []}
    ftd = ftd.sort_values("date")
    return {
        "points": [
            {"date": str(r["date"]), "ftds": int(r.get("ftds", 0) or 0)}
            for r in ftd.to_dict("records")
        ]
    }


@router.get("/ftd-reg-month/daily")
def ftd_reg_month_daily(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(FTD_REG_MONTH_DAILY_PATH, "ftd_reg_month_daily"), start, end)
    if df.empty:
        return {"points": []}
    df = df.sort_values("date")
    return {
        "points": [
            {"date": str(r["date"]), "ftd_reg_month": int(r.get("ftd_reg_month", 0) or 0)}
            for r in df.to_dict("records")
        ]
    }
