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
                    "\n\nVOICE (follow strictly):"
                    "\n- Use only the exact numbers from the data provided. Never round differently, never use different figures."
                    "\n- Short sentences. Active voice. One idea per sentence."
                    "\n- Currency in figures: R150k, R2.3m, R8,500."
                    "\n- British English throughout."
                    "\n- No em dashes. No filler adverbs. No banned phrases: leverage, synergy, robust, seamless, transformative, holistic, delve, ecosystem."
                    "\n\nCRITICAL DATA RULES:"
                    "\n- ONLY use the exact metric values from the data. Never invent, round differently, or assume values not in the data."
                    "\n- If a field is 0 or absent, skip it entirely. Do not comment on zero values."
                    "\n- Do not extrapolate or compute new figures beyond what is provided."
                    "\n\nOUTPUT STRUCTURE:"
                    "\n- wins: 2 to 3 genuine positives backed by actual numbers from the data."
                    "\n- alerts: 1 to 2 significant concerns only. An alert must be commercially meaningful (e.g. churn costing revenue). Skip minor observations."
                    "\n- watch_list: 2 to 3 metrics worth monitoring. Factual, specific, no generic advice."
                    "\n- NO recommendations key. Do not include it."
                    "\n\nReturn ONLY a valid JSON object with exactly these three keys: "
                    "wins (array of strings), alerts (array of strings), watch_list (array of strings). "
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

    # Only include fields with meaningful (non-zero) values to prevent AI inventing insights
    retention_lines = ""
    if retention_d7 > 0:
        retention_lines += f"\n- D7 Retention: {retention_d7:.1f}%"
    if retention_d30 > 0:
        retention_lines += f"\n- D30 Retention: {retention_d30:.1f}%"

    vip_lines = ""
    if total_vips > 0:
        vip_lines = f"""
VIP
- Total VIPs: {total_vips:,}
- VIP GGR Contribution: R{vip_ggr:,.0f}
- VIP GGR as % of Total: {(vip_ggr/ggr*100) if ggr > 0 else 0:.1f}%"""

    bonus_lines = ""
    if bonus_issued > 0:
        bonus_conv_rate = (bonus_converted / bonus_issued * 100) if bonus_issued > 0 else 0
        bonus_lines = f"""
BONUS
- Bonus Issued: R{bonus_issued:,.0f}
- Bonus Converted: R{bonus_converted:,.0f}
- Bonus Conversion Rate: {bonus_conv_rate:.1f}%"""

    tx_lines = ""
    if deposits > 0:
        tx_lines = f"""
TRANSACTIONS
- Total Deposits: R{deposits:,.0f}
- Total Withdrawals: R{withdrawals:,.0f}
- Net Cash: R{net_cash:,.0f}"""

    avg_ftd_line = f"\n- Avg First Deposit Value: R{avg_ftd_value:,.0f}" if avg_ftd_value > 0 else ""

    prompt = f"""
Playabets gaming operator data — {start} to {end} ({days} days).
USE ONLY THESE EXACT NUMBERS. Do not compute, round, or substitute different values.

PLAYER ACQUISITION
- Registrations: {registrations:,}
- FTDs (first-time depositors): {ftds:,}
- FTD Rate (players whose first-ever deposit fell in this period / total registrations): {conv_rate:.1f}%{avg_ftd_line}

REVENUE
- GGR: R{ggr:,.0f}
- NGR: R{ngr:,.0f}
- Turnover: R{turnover:,.0f}
- Hold %: {hold_pct:.1f}%
{tx_lines}
PLAYERS
- Active Players (unique): {active_players:,}
- Churn Rate: {churn_pct:.1f}%{retention_lines}
{vip_lines}
{bonus_lines}

Provide actionable insights in JSON format with wins, concerns, watch_list, and recommendations.
"""

    try:
        result = _call_azure_openai(prompt)
        _CACHE[cache_key] = result
        return {**result, "cached": False, "available": True}
    except Exception as exc:
        return {"available": False, "reason": str(exc)}
