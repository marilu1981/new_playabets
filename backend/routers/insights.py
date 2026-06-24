"""
routers/insights.py — AI-powered dashboard insights via Azure OpenAI.

Calls gpt-4o-mini with the period KPI data and returns structured insights
in four categories: wins, concerns, watch_list, recommendations.

Data never leaves Azure — uses Azure OpenAI endpoint in the same tenant.
Results are cached in-memory per period (hash of start+end+key metrics).
"""
from __future__ import annotations

import hashlib
import json
import os
from datetime import date
from typing import Optional

from fastapi import APIRouter, Query

router = APIRouter()

_CACHE: dict[str, dict] = {}  # cleared on each deployment

_ENDPOINT   = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
_KEY        = os.environ.get("AZURE_OPENAI_KEY", "")
_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
_API_VER    = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-07-18")


def _cache_key(**kwargs) -> str:
    payload = json.dumps(kwargs, sort_keys=True, default=str)
    return hashlib.md5(payload.encode()).hexdigest()


def _call_azure_openai(prompt: str) -> dict:
    from openai import AzureOpenAI
    client = AzureOpenAI(
        azure_endpoint=_ENDPOINT,
        api_key=_KEY,
        api_version=_API_VER,
    )
    resp = client.chat.completions.create(
        model=_DEPLOYMENT,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a gaming analytics practitioner with deep experience in South African sports betting and casino operations. "
                    "You write like someone who has built and operated gaming data products, not like a generalist consultant. "
                    "\n\nVoice rules (follow strictly):"
                    "\n- Lead with the finding, then justify it. Never throat-clear."
                    "\n- Short sentences. Active voice. One idea per sentence."
                    "\n- State risks plainly. If a number is bad, say so."
                    "\n- Connect mechanic to commercial consequence. 'Churn is 18%' is weak. 'Churn at 18% means one in five active players last month did not return' is strong. Calculate the ZAR cost from the data provided: cost = (churn_pct/100) * active_players * (ngr/active_players). Never write R[X] or placeholder values, always compute the actual figure."
                    "\n- Currency in figures: R150k, R2.3m, R8,500."
                    "\n- British English spelling throughout."
                    "\n- No em dashes. Use commas, colons, or full stops instead."
                    "\n- No filler adverbs: very, really, truly, simply, just."
                    "\n- No banned phrases: leverage, synergy, robust, seamless, world-class, best-in-class, transformative, paradigm, holistic, end-to-end, unlock value, going forward, ecosystem, space, delve."
                    "\n- No hedging: arguably, perhaps, it could be said, it may be worth considering."
                    "\n- Numbers: spell out one to nine, figures for 10 and above."
                    "\n\nRecommendations must name the specific action, not the category. "
                    "'Run a reactivation SMS to players who deposited in the past 60 days but not the past 30' is correct. "
                    "'Implement retention strategies' is not. Be that specific for every recommendation."
                    "\n\nReturn ONLY a valid JSON object with exactly these four keys: "
                    "wins (array of strings), concerns (array of strings), watch_list (array of strings), recommendations (array of strings). "
                    "Each array must contain exactly 2 to 3 items. Each item must be one or two sentences maximum. "
                    "Do not include any text outside the JSON object."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=800,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content or "{}"
    return json.loads(raw)


@router.post("/insights/ai-summary")
def ai_summary(
    start: date = Query(...),
    end:   date = Query(...),
    # KPIs passed as query params — no sensitive player data, just aggregates
    registrations:      int   = Query(0),
    ftds:               int   = Query(0),
    conv_rate:          float = Query(0.0),
    ggr:                float = Query(0.0),
    ngr:                float = Query(0.0),
    turnover:           float = Query(0.0),
    hold_pct:           float = Query(0.0),
    deposits:           float = Query(0.0),
    withdrawals:        float = Query(0.0),
    net_cash:           float = Query(0.0),
    churn_pct:          float = Query(0.0),
    retention_d7:       float = Query(0.0),
    retention_d30:      float = Query(0.0),
    active_players:     int   = Query(0),
    avg_ftd_value:      float = Query(0.0),
    total_vips:         int   = Query(0),
    vip_ggr:            float = Query(0.0),
    bonus_issued:       float = Query(0.0),
    bonus_converted:    float = Query(0.0),
):
    """Generate AI insights for the selected period using Azure OpenAI (gpt-4o-mini)."""
    if not _ENDPOINT or not _KEY:
        return {"available": False, "reason": "Azure OpenAI not configured"}

    cache_key = _cache_key(
        start=str(start), end=str(end),
        ggr=round(ggr, -3), ngr=round(ngr, -3),
        registrations=registrations, ftds=ftds,
        bonus_converted=round(bonus_converted, -3),
    )
    if cache_key in _CACHE:
        return {**_CACHE[cache_key], "cached": True, "available": True}

    days = (end - start).days + 1
    prompt = f"""
Playabets gaming operator performance report — {start} to {end} ({days} days).

PLAYER ACQUISITION
- New Registrations: {registrations:,}
- First Time Depositors (FTDs): {ftds:,}
- FTD Conversion Rate: {conv_rate:.1f}%
- Avg First Deposit Value: R{avg_ftd_value:,.0f}

REVENUE
- GGR (Gross Gaming Revenue): R{ggr:,.0f}
- NGR (Net Gaming Revenue): R{ngr:,.0f}
- Total Turnover: R{turnover:,.0f}
- Hold %: {hold_pct:.1f}%

TRANSACTIONS
- Total Deposits: R{deposits:,.0f}
- Total Withdrawals: R{withdrawals:,.0f}
- Net Cash: R{net_cash:,.0f}

PLAYER HEALTH
- Active Players: {active_players:,}
- Churn Rate: {churn_pct:.1f}%
- D7 Retention: {retention_d7:.1f}%
- D30 Retention: {retention_d30:.1f}%

VIP
- Total VIPs: {total_vips:,}
- VIP GGR Contribution: R{vip_ggr:,.0f}
- VIP GGR as % of Total: {(vip_ggr/ggr*100) if ggr > 0 else 0:.1f}%

BONUS
- Bonus Issued: R{bonus_issued:,.0f}
- Bonus Converted: R{bonus_converted:,.0f}
- Bonus Conversion Rate: {(bonus_converted/bonus_issued*100) if bonus_issued > 0 else 0:.1f}%

Provide actionable insights in JSON format with wins, concerns, watch_list, and recommendations.
"""

    try:
        result = _call_azure_openai(prompt)
        _CACHE[cache_key] = result
        return {**result, "cached": False, "available": True}
    except Exception as exc:
        return {"available": False, "reason": str(exc)}
