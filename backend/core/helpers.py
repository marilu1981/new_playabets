"""
core/helpers.py — Scalar aggregation helpers and summary-period logic.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import numpy as np
import pandas as pd

from src.app_config import ENABLE_TRANSACTIONS
from backend.core.cache import (
    _PARQUET_CACHE,
    DATA_START_DATE,
    TAXES_RAW_DIR,
    CHURN_MONTHLY_PATH,
    DEPOSITORS_MONTHLY_PATH,
    TOTAL_ACTIVES_MONTHLY_PATH,
    TX_DAILY_PATH,
    BONUS_DAILY_PATH,
    FTD_DAILY_PATH,
    FTD_REG_MONTH_DAILY_PATH,
    ACTIVES_MONTHLY_PATH,
    CASINO_DAILY_PATH,
    load_parquet_cached,
    load_daily_df,
)


def _filter_range(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    if df.empty or "date" not in df.columns:
        return df
    effective_start = max(start, DATA_START_DATE)
    return df[(df["date"] >= effective_start) & (df["date"] <= end)]


def _s(df: pd.DataFrame, col: str) -> float:
    return float(df[col].sum()) if col in df.columns else 0.0


def _i(df: pd.DataFrame, col: str) -> int:
    return int(df[col].sum()) if col in df.columns else 0


def _mean_i(df: pd.DataFrame, col: str) -> int:
    """Return rounded mean of a column — used for avg daily unique users."""
    return int(round(df[col].mean())) if col in df.columns and len(df) > 0 else 0


def _get_taxes_paid(start: date, end: date) -> float:
    """Return total taxes paid for the period. Caches the combined DataFrame by newest-file mtime."""
    if not TAXES_RAW_DIR.exists():
        return 0.0
    files = sorted(TAXES_RAW_DIR.glob("taxes_*.parquet"))
    if not files:
        return 0.0
    newest_mtime = max(f.stat().st_mtime for f in files)
    cache_key = "_taxes_raw"
    cached = _PARQUET_CACHE.get(cache_key)
    if cached is None or cached.get("mtime") != newest_mtime:
        df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
        if "date" in df.columns:
            df["_d"] = pd.to_datetime(df["date"], errors="coerce").dt.date
        _PARQUET_CACHE[cache_key] = {"mtime": newest_mtime, "df": df}
    else:
        df = cached["df"]
    if df.empty or "_d" not in df.columns or "taxes_paid" not in df.columns:
        return 0.0
    # Deduplicate by date — cron runs accumulate duplicate records across multiple files
    df = df.drop_duplicates(subset=["_d"], keep="last")
    return round(float(df[(df["_d"] >= start) & (df["_d"] <= end)]["taxes_paid"].sum()), 2)


def _get_churn_pct(end: date) -> float:
    """Return churn % for the month ending on `end`."""
    churn = load_parquet_cached(CHURN_MONTHLY_PATH, "churn_monthly")
    if churn.empty or "month" not in churn.columns:
        return 0.0
    end_month = end.strftime("%Y-%m")
    row = churn[churn["month"] == end_month]
    return float(row["churn_pct"].iloc[0]) if not row.empty else 0.0


def _get_monthly_depositors(start: date, end: date) -> int:
    """Return period-unique depositors by summing monthly unique counts."""
    dep = load_parquet_cached(DEPOSITORS_MONTHLY_PATH, "depositors_monthly")
    if dep.empty or "month" not in dep.columns:
        return 0
    start_month = start.strftime("%Y-%m")
    end_month = end.strftime("%Y-%m")
    mask = (dep["month"] >= start_month) & (dep["month"] <= end_month)
    filtered = dep[mask]
    if filtered.empty:
        return 0
    # For a single month: exact unique count. For multi-month: sum (slight overcount).
    return int(filtered["unique_depositors"].sum())


def _get_total_actives(start: date, end: date) -> int:
    """Return period-unique total actives (sports + casino combined, no double count)."""
    total_act = load_parquet_cached(TOTAL_ACTIVES_MONTHLY_PATH, "total_actives_monthly")
    if total_act.empty or "month" not in total_act.columns:
        return 0
    start_month = start.strftime("%Y-%m")
    end_month = end.strftime("%Y-%m")
    mask = (total_act["month"] >= start_month) & (total_act["month"] <= end_month)
    filtered = total_act[mask]
    if "total_actives_unique" in filtered.columns:
        return int(filtered["total_actives_unique"].sum())
    return 0


def _load_transactions_df(start: date, end: date) -> pd.DataFrame:
    if not ENABLE_TRANSACTIONS:
        return pd.DataFrame()
    return _filter_range(load_parquet_cached(TX_DAILY_PATH, "tx_daily"), start, end)


def _summary_period(start: date, end: date) -> dict:
    """Aggregate all summary-table metrics for a given date range."""
    df = _filter_range(load_daily_df(), start, end)
    casino = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)
    ftd = _filter_range(load_parquet_cached(FTD_DAILY_PATH, "ftd_daily"), start, end)
    bonus = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)
    tx = _load_transactions_df(start, end)

    regs = _i(df, "registrations")
    ftds = _i(ftd, "ftds")

    # FTD Reg Month: users who registered in the period AND have ever deposited (lifetime).
    ftd_reg_month_df = _filter_range(load_parquet_cached(FTD_REG_MONTH_DAILY_PATH, "ftd_reg_month_daily"), start, end)
    ftd_reg_month = _i(ftd_reg_month_df, "ftd_reg_month")

    # Conv rate = FTD Reg Month ÷ Registrations (users who registered AND ever deposited).
    conv_rate = round(ftd_reg_month / regs * 100, 1) if regs > 0 else 0.0

    sports_turnover_real  = _s(df, "placed_stake")         # real money sports turnover
    sports_turnover_bonus = _s(df, "placed_stake_bonus")   # bonus sports turnover (~R320K)
    sports_turnover = sports_turnover_real + sports_turnover_bonus  # total sports
    sports_winnings = _s(df, "settled_winnings")
    sports_ggr_real = _s(df, "ggr")               # real money GGR (for NGR)
    sports_ggr_total = _s(df, "ggr_total") or sports_ggr_real  # total GGR incl. bonus bets
    sports_bets = _i(df, "betslips_count")
    sports_settled = _i(df, "betslips_settled_count")
    avg_stake = round(sports_turnover / sports_bets, 2) if sports_bets > 0 else 0.0
    win_rate = round(_s(df, "win_rate"), 1) if "win_rate" in df.columns and len(df) > 0 else 0.0
    cancel_rate = round(_s(df, "cancel_rate"), 1) if "cancel_rate" in df.columns and len(df) > 0 else 0.0

    # Horse racing (Betmakers) is separated from casino in casino_daily.parquet.
    # Add it to sports totals so casino figures reflect pure casino only.
    horse_racing_ggr     = _s(casino, "horse_racing_ggr")
    horse_racing_stake   = _s(casino, "horse_racing_stake")
    sports_ggr_real     += horse_racing_ggr
    sports_ggr_total    += horse_racing_ggr
    sports_turnover     += horse_racing_stake
    sports_ggr = sports_ggr_total  # alias for hold% calc
    sports_hold = round(sports_ggr / sports_turnover * 100, 1) if sports_turnover > 0 else 0.0

    casino_stake         = _s(casino, "casino_stake")
    casino_winnings      = _s(casino, "casino_winnings")
    casino_ggr           = _s(casino, "casino_ggr")           # real money GGR (for NGR)
    casino_total_ggr     = _s(casino, "casino_total_ggr") or casino_ggr  # real + bonus GGR (display, excl lotto)
    casino_total_stake   = _s(casino, "casino_total_stake") or casino_stake  # real + bonus stake (excl lotto)
    lotto_ggr            = _s(casino, "lotto_ggr")            # lotto GGR (added to totals)
    lotto_stake          = _s(casino, "lotto_stake")          # lotto stake (added to totals)
    casino_bets = _i(casino, "casino_bets")
    casino_margin = round(casino_total_ggr / casino_total_stake * 100, 1) if casino_total_stake > 0 else 0.0
    casino_rtp = round(100.0 - casino_margin, 1)
    casino_display_ggr = casino_total_ggr  # Casino page shows casino only (no lotto)

    # Taxes paid — must be computed before total_ggr (client formula: GGR = Real+Bonus GGR - Taxes)
    taxes_paid = _get_taxes_paid(start, end)

    # GGR = Real Money GGR + Bonus Money GGR - Taxes Paid By User (client formula)
    casino_bonus_ggr_sp = _s(casino, "casino_bonus_ggr")
    sports_bonus_ggr = sports_ggr_total - sports_ggr_real  # ggr_total - ggr = bonus bet GGR
    bonus_money_ggr = sports_bonus_ggr + casino_bonus_ggr_sp
    total_ggr = sports_ggr_total + casino_total_ggr + lotto_ggr - taxes_paid   # display GGR (incl lotto, net of taxes)
    # Real Money GGR = sports_real + casino_real + lotto - taxes (client formula)
    real_money_ggr = sports_ggr_real + casino_ggr                              # pre-tax, excl lotto
    real_money_ggr_display = real_money_ggr + lotto_ggr - taxes_paid           # displayed value: incl lotto, net of taxes
    bonus_spent = _s(bonus, "bonus_total") or _s(bonus, "bonus_credited")
    freebet_issued = _s(bonus, "freebet_issued")
    freebet_spend  = _s(bonus, "freebet_spend")
    # NGR = Real Money GGR (displayed: incl lotto, net of taxes) - Bonus Converted (client formula)
    bonus_converted = _s(tx, "bonus_redeemed")
    ngr = real_money_ggr_display - (bonus_converted if bonus_converted > 0 else bonus_spent)
    total_turnover = sports_turnover + casino_total_stake + lotto_stake  # sports + casino + lotto
    real_money_turnover = sports_turnover_real + _s(casino, "casino_stake") + horse_racing_stake
    bonus_money_turnover = sports_turnover_bonus + _s(casino, "casino_bonus_stake")
    hold_pct = round(total_ggr / total_turnover * 100, 1) if total_turnover > 0 else 0.0

    # Actives: period-total unique users from actives_monthly.parquet.
    # Approximation: sum monthly uniques for months overlapping the date range.
    # (Slight overcount for multi-month periods where users are active in multiple months.)
    actives_monthly = load_parquet_cached(ACTIVES_MONTHLY_PATH, "actives_monthly")
    actives_sports = 0
    actives_casino = 0
    if not actives_monthly.empty and "month" in actives_monthly.columns:
        start_month = start.strftime("%Y-%m")
        end_month = end.strftime("%Y-%m")
        mask = (actives_monthly["month"] >= start_month) & (actives_monthly["month"] <= end_month)
        filtered = actives_monthly[mask]
        if "sports_actives_unique" in filtered.columns:
            actives_sports = int(filtered["sports_actives_unique"].sum())
        if "casino_actives_unique" in filtered.columns:
            actives_casino = int(filtered["casino_actives_unique"].sum())
    # Fall back to daily average if monthly unique not yet available
    if actives_sports == 0:
        actives_sports = _mean_i(df, "actives_sports")
    if actives_casino == 0:
        actives_casino = _mean_i(casino, "casino_actives")

    # Churn: % of prev-month actives who didn't bet this month
    churn_monthly = load_parquet_cached(CHURN_MONTHLY_PATH, "churn_monthly")
    churn_pct = 0.0
    if not churn_monthly.empty and "month" in churn_monthly.columns:
        end_month = end.strftime("%Y-%m")
        churn_row = churn_monthly[churn_monthly["month"] == end_month]
        if not churn_row.empty:
            churn_pct = float(churn_row["churn_pct"].iloc[0])

    # Bonus from BonusTransactions (ReasonID 64=issued, 65=reversed)
    bonus_tx_issued   = _s(bonus, "bonus_tx_issued")
    bonus_tx_reversed = _s(bonus, "bonus_tx_reversed")
    bonus_tx_net      = _s(bonus, "bonus_tx_net")
    bonus_converted   = _s(tx, "bonus_redeemed")
    unique_depositors = _i(tx, "unique_depositors")
    deposits          = _s(tx, "deposits")
    bonus_pct = round(bonus_converted / bonus_tx_net * 100, 1) if bonus_tx_net > 0 else 0.0

    return {
        "registrations": regs, "ftds": ftds, "ftd_conv_rate": conv_rate,
        "ftd_reg_month": ftd_reg_month,
        "actives_sports": actives_sports, "actives_casino": actives_casino,
        "turnover": round(total_turnover, 2),
        "real_money_turnover": round(real_money_turnover, 2),
        "bonus_money_turnover": round(bonus_money_turnover, 2),
        "ggr": round(total_ggr, 2),
        "real_money_ggr": round(real_money_ggr_display, 2),
        "bonus_money_ggr": round(bonus_money_ggr, 2),
        "ngr": round(ngr, 2), "hold_pct": hold_pct,
        "bonus_spent": round(bonus_spent, 2), "freebet_spend": round(freebet_spend, 2),
        "bonus_tx_issued": round(bonus_tx_issued, 2),
        "bonus_tx_reversed": round(bonus_tx_reversed, 2),
        "bonus_tx_net": round(bonus_tx_net, 2),
        "bonus_redeemed": round(bonus_converted, 2),
        "bonus_pct": bonus_pct,
        "unique_depositors": unique_depositors,
        "deposits": round(deposits, 2),
        "churn_pct": churn_pct,
        "taxes_paid": round(taxes_paid, 2),
        "period_unique_depositors": _get_monthly_depositors(start, end),
        "sports_bets": sports_bets, "sports_settled": sports_settled,
        "sports_turnover": round(sports_turnover, 2), "sports_winnings": round(sports_winnings, 2),
        "sports_ggr": round(sports_ggr, 2), "sports_hold": sports_hold,
        "win_rate": win_rate, "cancel_rate": cancel_rate, "avg_stake": avg_stake,
        "sports_actives": actives_sports,
        "horse_racing_ggr": round(horse_racing_ggr, 2),
        "horse_racing_stake": round(horse_racing_stake, 2),
        "horse_racing_bets": _i(casino, "horse_racing_bets"),
        "horse_racing_actives": _i(casino, "horse_racing_actives"),
        "lotto_ggr": round(lotto_ggr, 2),
        "lotto_stake": round(lotto_stake, 2),
        "lotto_bets": _i(casino, "lotto_bets"),
        "lotto_actives": _i(casino, "lotto_actives"),
        "casino_bets": casino_bets, "casino_stake": round(casino_total_stake, 2),
        "casino_winnings": round(casino_winnings, 2),
        "casino_ggr": round(casino_display_ggr, 2),        # total (real + bonus) for display
        "casino_ggr_real": round(casino_ggr, 2),           # real money only
        "casino_margin": casino_margin, "casino_rtp": casino_rtp, "casino_actives": actives_casino,
    }
