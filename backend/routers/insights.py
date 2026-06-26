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


_PROMPT_VERSION = "v11"  # bumped: VIP GGR share-of-total only when real total supplied

def _cache_key(**kwargs) -> str:
    payload = json.dumps({**kwargs, "_pv": _PROMPT_VERSION}, sort_keys=True, default=str)
    return hashlib.md5(payload.encode()).hexdigest()


def _call_azure_openai(prompt: str, context: str = "home") -> dict:
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
                    f"{_CONTEXT_PROMPTS.get(context, _CONTEXT_PROMPTS['home'])} "
                    "You write like someone who has built and operated gaming data products, not like a generalist consultant. "
                    "VOICE (follow strictly):"
                    "\n- Use only the exact numbers from the data provided. Never round differently, never use different figures."
                    "\n- Short sentences. Active voice. One idea per sentence."
                    "\n- State facts, not speculation. Never write 'could lead to', 'may result in', 'if not addressed', 'at risk of', 'could impact', 'substantial', 'significant' without a specific number to back it."
                    "\n- For churn: state what it means factually. 'Churn at 50%  means one in two active players last month did not return.' Do not add 'which could lead to...' unless you can compute the exact ZAR cost from NGR and churn rate."
                    "\n- Currency in figures: R150k, R2.3m, R8,500."
                    "\n- British English throughout."
                    "\n- No em dashes. No filler adverbs."
                    "\n- Banned words (never use): leverage, synergy, robust, seamless, transformative, holistic, delve, ecosystem, substantial, significant, at risk, crucial, critical, essential, extremely."
                    "\n\nDATA RULES (mandatory):"
                    "\n- ONLY use the exact metric values from the data. Never invent, round differently, or assume values not in the data."
                    "\n- If a field is 0 or absent, skip it entirely. Do not comment on zero values."
                    "\n- Do not extrapolate or compute new figures beyond what is provided."
                    "\n- NEVER calculate a percentage change yourself. The ONLY percentage changes you may state are the exact ones already written in the 'PERIOD-OVER-PERIOD CHANGES' section (e.g. '+2.2%'). Copy them verbatim. If a change figure is not in that section, do not state any percentage change for that metric."
                    "\n- When you mention a change, quote the exact percentage from the PERIOD-OVER-PERIOD CHANGES section character for character. Do not derive your own."
                    "\n\nOUTPUT STRUCTURE:"
                    "\n- wins: 2 to 3 genuine positives backed by actual numbers. No generic praise."
                    "\n- alerts: 1 to 2 facts that need attention, stated plainly with the actual number. No speculation about consequences."
                    "\n- watch_list: 2 to 3 specific metrics worth monitoring. State the value and why it matters numerically."
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
    return _scrub_banned(json.loads(raw))


# Deterministic safety net: even if the model ignores the prompt, these words
# never reach the user. Order matters — phrases before single words.
_BANNED_REPLACEMENTS: list[tuple[str, str]] = [
    ("which is critical", "which is worth noting"),
    ("which is crucial", "which is worth noting"),
    ("which is essential", "which is worth noting"),
    ("is critical for", "is useful for"),
    ("is crucial for", "is useful for"),
    ("is essential for", "is useful for"),
    ("at risk", "to watch"),
    ("leverage", "use"),
    ("synergy", "alignment"),
    ("robust", "strong"),
    ("seamless", "smooth"),
    ("transformative", "notable"),
    ("holistic", "overall"),
    ("delve", "look"),
    ("ecosystem", "platform"),
    ("substantial", "sizeable"),
    ("significant", "notable"),
    ("crucial", "notable"),
    ("critical", "notable"),
    ("essential", "key"),
    ("extremely", "very"),
]


def _scrub_word(text: str) -> str:
    import re
    out = text
    for bad, good in _BANNED_REPLACEMENTS:
        # word-boundary, case-insensitive; preserve leading capital
        def _repl(m: re.Match) -> str:
            return good.capitalize() if m.group(0)[:1].isupper() else good
        out = re.sub(rf"\b{re.escape(bad)}\b", _repl, out, flags=re.IGNORECASE)
    return out


def _scrub_banned(data: dict) -> dict:
    for key in ("wins", "alerts", "watch_list"):
        items = data.get(key)
        if isinstance(items, list):
            data[key] = [_scrub_word(str(i)) for i in items]
    return data


_CONTEXT_PROMPTS: dict[str, str] = {
    "home": (
        "You are analysing the EXECUTIVE OVERVIEW for a South African gaming operator. "
        "Focus on overall business health: revenue, player acquisition, deposits, churn. "
        "Do not mention VIP players or CRM metrics unless they are explicitly in the data."
    ),
    "crm": (
        "You are analysing the CRM DASHBOARD for a South African gaming operator. "
        "Focus on player behaviour: retention, churn, cohort conversion, deposit patterns. "
        "Do not mention VIP-specific metrics or overall business revenue unless explicitly provided."
    ),
    "vip": (
        "You are analysing the VIP PORTFOLIO for a South African gaming operator. "
        "Focus only on the high-value player segment: VIP GGR, turnover, hold%, active VIPs, avg revenue per VIP. "
        "Do not mention general registrations, FTDs, or CRM metrics."
    ),
}

@router.post("/insights/ai-summary")
def ai_summary(
    start: date = Query(...),
    end:   date = Query(...),
    context: str = Query("home"),  # which page: home | crm | vip
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
    # Previous period for comparison
    prev_ggr:           float = Query(0.0),
    prev_ngr:           float = Query(0.0),
    prev_registrations: int   = Query(0),
    prev_ftds:          int   = Query(0),
    prev_turnover:      float = Query(0.0),
):
    """Generate AI insights for the selected period using Azure OpenAI (gpt-4o-mini)."""
    if not _ENDPOINT or not _KEY:
        return {"available": False, "reason": "Azure OpenAI not configured"}

    cache_key = _cache_key(
        context=context,
        start=str(start), end=str(end),
        ggr=round(ggr, -3), ngr=round(ngr, -3),
        registrations=registrations, ftds=ftds,
        bonus_converted=round(bonus_converted, -3),
        prev_ggr=round(prev_ggr, -3),
        prev_ngr=round(prev_ngr, -3),
        prev_registrations=prev_registrations,
        prev_ftds=prev_ftds,
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
- VIP GGR: R{vip_ggr:,.0f}
- Avg revenue per VIP: R{(vip_ggr/total_vips) if total_vips > 0 else 0:,.0f}"""
        # Only state share-of-total when a genuine company-wide GGR was supplied
        # (the VIP page passes ggr == vip_ggr, which would falsely read 100%).
        if ggr > vip_ggr > 0:
            vip_lines += f"\n- VIP GGR as % of Total: {vip_ggr/ggr*100:.1f}%"

    bonus_lines = ""
    if bonus_issued > 0:
        bonus_conv_rate = (bonus_converted / bonus_issued * 100) if bonus_issued > 0 else 0
        bonus_lines = f"""
BONUS (note: high conversion rate means higher cost to the house, not a positive)
- Bonus Issued: R{bonus_issued:,.0f}
- Bonus Converted (cost to house): R{bonus_converted:,.0f}
- Bonus Conversion Rate: {bonus_conv_rate:.1f}% (higher = more cost, watch against NGR impact)"""

    tx_lines = ""
    if deposits > 0:
        tx_lines = f"""
TRANSACTIONS
- Total Deposits: R{deposits:,.0f}
- Total Withdrawals: R{withdrawals:,.0f}
- Net Cash: R{net_cash:,.0f}"""

    avg_ftd_line = f"\n- Avg First Deposit Value: R{avg_ftd_value:,.0f}" if avg_ftd_value > 0 else ""

    # Build previous period comparison lines
    prev_lines = ""
    if prev_ggr > 0 or prev_registrations > 0:
        def pct_change(curr: float, prev: float) -> str:
            if prev <= 0: return "n/a"
            chg = (curr - prev) / prev * 100
            return f"+{chg:.1f}%" if chg >= 0 else f"{chg:.1f}%"

        prev_lines = f"""
PERIOD-OVER-PERIOD CHANGES (these percentages are PRE-CALCULATED — copy them exactly, do NOT compute your own)
- GGR: now R{ggr:,.0f} ({pct_change(ggr, prev_ggr)} vs previous R{prev_ggr:,.0f})
- NGR: now R{ngr:,.0f} ({pct_change(ngr, prev_ngr)} vs previous R{prev_ngr:,.0f})
- Registrations: now {registrations:,} ({pct_change(registrations, prev_registrations)} vs previous {prev_registrations:,})
- FTDs: now {ftds:,} ({pct_change(ftds, prev_ftds)} vs previous {prev_ftds:,})
- Turnover: now R{turnover:,.0f} ({pct_change(turnover, prev_turnover)} vs previous R{prev_turnover:,.0f})
The "now" figures above are THIS period's actual values. The percentages in brackets are correct — use them verbatim and never recalculate."""

    prompt = f"""
Playabets gaming operator data — {start} to {end} ({days} days).
USE ONLY THESE EXACT NUMBERS. Do not compute, round, or substitute different values.

PLAYER ACQUISITION
- Registrations: {registrations:,}
- FTDs (first-time depositors): {ftds:,}
- FTDs as % of Registrations: {conv_rate:.1f}%{avg_ftd_line}

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

{prev_lines}

Provide insights in JSON format: wins, alerts, watch_list only. Reference period-over-period changes where available.
"""

    try:
        result = _call_azure_openai(prompt, context)
        _CACHE[cache_key] = result
        return {**result, "cached": False, "available": True}
    except Exception as exc:
        return {"available": False, "reason": str(exc)}
