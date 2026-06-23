"""
affiliate_kpis.py
-----------------
Aggregates raw RavenTrack affiliate and player parquet files into
serving-layer summaries for the Acquisition Dashboard.

Channel classification uses affiliate_name keyword matching:
  Google Ads  — names containing: google, goog, gads, rmads
  Meta        — names containing: facebook, fb_, insta, meta
  Influencers — names containing: spin, king, bet_, play_, levit, stian,
                                  king, connect, wholesome, missmoney,
                                  zol, pbs, stiaan, auctera, digi4u
  Affiliates  — all remaining tracked affiliates
  Organic     — not tracked via RavenTrack (set to 0)
"""
from __future__ import annotations

import re
import pandas as pd

# ── Channel classification keywords ──────────────────────────────────────────
_GOOGLE_KEYWORDS  = re.compile(r"google|goog|gads|rmads", re.I)
_META_KEYWORDS    = re.compile(r"facebook|fb_|insta|meta|playa_fb|playafb", re.I)
_INFLUENCER_KEYWORDS = re.compile(
    r"missmoney|wholesom|kingburg|levit8|stiaan|auctera|digi4u|pbs\b|"
    r"connectbet|betconnect|sportsboom|fablepops|nmtplay|zolh|"
    r"tiaanbets|officialk|playabets_insta",
    re.I,
)


def classify_channel(affiliate_name: str) -> str:
    """Return acquisition channel for a given affiliate username."""
    name = str(affiliate_name or "")
    if _GOOGLE_KEYWORDS.search(name):
        return "Google Ads"
    if _META_KEYWORDS.search(name):
        return "Meta"
    if _INFLUENCER_KEYWORDS.search(name):
        return "Influencers"
    return "Affiliates"


def compute_affiliate_summary(affiliates_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Compute per-affiliate KPIs and add channel classification.
    """
    if affiliates_raw.empty:
        return pd.DataFrame(columns=[
            "affiliate_id", "affiliate_name", "channel", "clicks", "registrations",
            "ftds", "ftd_amount", "revenue", "marketing_spend",
            "cpa", "roi_pct", "avg_ftd_value", "conv_rate_pct",
            "date_from", "date_to",
        ])

    df = affiliates_raw.copy()

    # Use commission as marketing_spend if absent
    if "marketing_spend" not in df.columns and "commission" in df.columns:
        df["marketing_spend"] = df["commission"]
    elif "marketing_spend" not in df.columns:
        df["marketing_spend"] = 0.0

    for col in ["clicks", "registrations", "ftds", "ftd_amount", "revenue", "marketing_spend"]:
        df[col] = pd.to_numeric(df.get(col, 0), errors="coerce").fillna(0.0)

    # Classify each affiliate into a channel
    name_col = "affiliate_name" if "affiliate_name" in df.columns else "affiliate_id"
    df["channel"] = df[name_col].apply(classify_channel)

    df["cpa"]           = df.apply(lambda r: round(r["marketing_spend"] / r["ftds"], 2) if r["ftds"] > 0 else 0.0, axis=1)
    df["roi_pct"]       = df.apply(lambda r: round((r["revenue"] - r["marketing_spend"]) / r["marketing_spend"] * 100, 1) if r["marketing_spend"] > 0 else 0.0, axis=1)
    df["avg_ftd_value"] = df.apply(lambda r: round(r["ftd_amount"] / r["ftds"], 2) if r["ftds"] > 0 else 0.0, axis=1)
    df["conv_rate_pct"] = df.apply(lambda r: round(r["ftds"] / r["registrations"] * 100, 1) if r["registrations"] > 0 else 0.0, axis=1)

    keep = [c for c in [
        "affiliate_id", "affiliate_name", "channel", "clicks", "registrations",
        "ftds", "ftd_amount", "revenue", "marketing_spend",
        "cpa", "roi_pct", "avg_ftd_value", "conv_rate_pct",
        "date_from", "date_to",
    ] if c in df.columns]

    return df[keep].sort_values("revenue", ascending=False).reset_index(drop=True)


def _channel_rollup(df: pd.DataFrame, channel: str) -> dict:
    """Sum all affiliates belonging to a channel."""
    s = df[df["channel"] == channel] if not df.empty else df
    if s.empty:
        return {
            "channel": channel, "registrations": 0, "ftds": 0, "ftd_amount": 0.0,
            "revenue": 0.0, "marketing_spend": 0.0, "cpa": 0.0,
            "roi_pct": 0.0, "avg_ftd_value": 0.0, "has_data": False,
        }
    spend   = float(s["marketing_spend"].sum())
    ftds    = int(s["ftds"].sum())
    rev     = float(s["revenue"].sum())
    ftd_v   = float(s["ftd_amount"].sum()) if "ftd_amount" in s else 0.0
    regs    = int(s["registrations"].sum())
    clicks  = int(s["clicks"].sum()) if "clicks" in s else 0
    return {
        "channel":         channel,
        "registrations":   regs,
        "clicks":          clicks,
        "ftds":            ftds,
        "ftd_amount":      round(ftd_v, 2),
        "revenue":         round(rev, 2),
        "marketing_spend": round(spend, 2),
        "cpa":             round(spend / ftds, 2) if ftds > 0 else 0.0,
        "roi_pct":         round((rev - spend) / spend * 100, 1) if spend > 0 else 0.0,
        "avg_ftd_value":   round(ftd_v / ftds, 2) if ftds > 0 else 0.0,
        "has_data":        True,
    }


def compute_channel_totals(affiliate_summary: pd.DataFrame) -> list:
    """
    Group affiliates by channel. Organic = 0 (not tracked via RavenTrack).
    """
    channels = [
        _channel_rollup(affiliate_summary, "Affiliates"),
        _channel_rollup(affiliate_summary, "Google Ads"),
        _channel_rollup(affiliate_summary, "Meta"),
        _channel_rollup(affiliate_summary, "Influencers"),
        {
            "channel": "Organic", "registrations": 0, "clicks": 0,
            "ftds": 0, "ftd_amount": 0.0, "revenue": 0.0,
            "marketing_spend": 0.0, "cpa": 0.0, "roi_pct": 0.0,
            "avg_ftd_value": 0.0, "has_data": False,
        },
    ]
    return channels
