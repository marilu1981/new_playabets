"""
routers/product.py — Product daily vertical breakdown endpoint.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from backend.core.cache import (
    CASINO_DAILY_PATH,
    load_parquet_cached,
    load_daily_df,
)
from backend.core.helpers import _filter_range

router = APIRouter()


@router.get("/product/daily")
def product_daily(start: date = Query(...), end: date = Query(...)):
    """Daily GGR, Turnover, Hold% for each product vertical."""
    casino = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)
    daily  = _filter_range(load_daily_df(), start, end)

    # Build date union
    dates = sorted(set(
        [str(d) for d in casino["date"].tolist()] +
        [str(d) for d in daily["date"].tolist()]
    ))

    casino_map = {str(r["date"]): r for _, r in casino.iterrows()} if not casino.empty else {}
    daily_map  = {str(r["date"]): r for _, r in daily.iterrows()}  if not daily.empty else {}

    points = []
    for d in dates:
        c = casino_map.get(d, {})
        s = daily_map.get(d, {})
        sports_turn = float(s.get("placed_stake", 0) or 0) + float(s.get("placed_stake_bonus", 0) or 0)
        sports_ggr  = float(s.get("ggr_total", 0) or s.get("ggr", 0) or 0)
        sports_bets = int(s.get("betslips_count", 0) or 0)
        casino_turn = float(c.get("casino_total_stake", 0) or c.get("casino_stake", 0) or 0)
        casino_ggr  = float(c.get("casino_total_ggr",  0) or c.get("casino_ggr",  0) or 0)
        casino_bets = int(c.get("casino_bets", 0) or 0)
        hr_turn = float(c.get("horse_racing_stake", 0) or 0)
        hr_ggr  = float(c.get("horse_racing_ggr",   0) or 0)
        hr_bets = int(c.get("horse_racing_bets",    0) or 0)
        lt_turn = float(c.get("lotto_stake", 0) or 0)
        lt_ggr  = float(c.get("lotto_ggr",   0) or 0)
        lt_bets = int(c.get("lotto_bets",    0) or 0)
        points.append({
            "date": d,
            "sports_ggr": sports_ggr, "sports_turnover": sports_turn,
            "sports_hold": round(sports_ggr / sports_turn * 100, 2) if sports_turn else 0,
            "sports_avg_bet": round(sports_turn / sports_bets, 2) if sports_bets else 0,
            "casino_ggr": casino_ggr, "casino_turnover": casino_turn,
            "casino_hold": round(casino_ggr / casino_turn * 100, 2) if casino_turn else 0,
            "casino_avg_bet": round(casino_turn / casino_bets, 2) if casino_bets else 0,
            "horse_racing_ggr": hr_ggr, "horse_racing_turnover": hr_turn,
            "horse_racing_hold": round(hr_ggr / hr_turn * 100, 2) if hr_turn else 0,
            "horse_racing_avg_bet": round(hr_turn / hr_bets, 2) if hr_bets else 0,
            "lotto_ggr": lt_ggr, "lotto_turnover": lt_turn,
            "lotto_hold": round(lt_ggr / lt_turn * 100, 2) if lt_turn else 0,
            "lotto_avg_bet": round(lt_turn / lt_bets, 2) if lt_bets else 0,
        })
    return {"points": points}
