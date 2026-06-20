"""
affiliate_kpis.py
-----------------
Aggregates raw RavenTrack affiliate and player parquet files into
serving-layer daily/period summaries for the Acquisition Dashboard.

Output files written to SERVING_ROOT:
    affiliate_summary.parquet  — one row per affiliate per period
    affiliate_daily.parquet    — placeholder for future daily-granularity data
"""
from __future__ import annotations

import pandas as pd
from pathlib import Path


def compute_affiliate_summary(affiliates_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Compute per-affiliate KPIs from raw affiliate API rows.

    Expected input columns (from raventrack_affiliates.fetch_affiliates):
        affiliate_id, affiliate_name, clicks, registrations, ftds,
        ftd_amount, revenue, commission, marketing_spend, date_from, date_to

    Returns one row per affiliate with derived KPIs:
        cpa           = marketing_spend / ftds        (cost per acquisition)
        roi_pct       = (revenue - marketing_spend) / marketing_spend * 100
        avg_ftd_value = ftd_amount / ftds
        conv_rate_pct = ftds / registrations * 100
    """
    if affiliates_raw.empty:
        return pd.DataFrame(columns=[
            "affiliate_id", "affiliate_name", "clicks", "registrations",
            "ftds", "ftd_amount", "revenue", "marketing_spend",
            "cpa", "roi_pct", "avg_ftd_value", "conv_rate_pct",
            "date_from", "date_to",
        ])

    df = affiliates_raw.copy()

    # Use commission as marketing_spend if marketing_spend column absent
    if "marketing_spend" not in df.columns and "commission" in df.columns:
        df["marketing_spend"] = df["commission"]
    elif "marketing_spend" not in df.columns:
        df["marketing_spend"] = 0.0

    for col in ["clicks", "registrations", "ftds", "ftd_amount", "revenue", "marketing_spend"]:
        df[col] = pd.to_numeric(df.get(col, 0), errors="coerce").fillna(0.0)

    df["cpa"]           = df.apply(lambda r: round(r["marketing_spend"] / r["ftds"], 2) if r["ftds"] > 0 else 0.0, axis=1)
    df["roi_pct"]       = df.apply(lambda r: round((r["revenue"] - r["marketing_spend"]) / r["marketing_spend"] * 100, 1) if r["marketing_spend"] > 0 else 0.0, axis=1)
    df["avg_ftd_value"] = df.apply(lambda r: round(r["ftd_amount"] / r["ftds"], 2) if r["ftds"] > 0 else 0.0, axis=1)
    df["conv_rate_pct"] = df.apply(lambda r: round(r["ftds"] / r["registrations"] * 100, 1) if r["registrations"] > 0 else 0.0, axis=1)

    keep = [c for c in [
        "affiliate_id", "affiliate_name", "clicks", "registrations",
        "ftds", "ftd_amount", "revenue", "marketing_spend",
        "cpa", "roi_pct", "avg_ftd_value", "conv_rate_pct",
        "date_from", "date_to",
    ] if c in df.columns]

    return df[keep].sort_values("revenue", ascending=False).reset_index(drop=True)


def compute_channel_totals(affiliate_summary: pd.DataFrame) -> dict:
    """
    Roll affiliate-level data into a single 'Affiliates' channel total.
    Other channels (Google Ads, Meta, Influencers, Organic) are placeholders.
    """
    if affiliate_summary.empty:
        aff = {"channel": "Affiliates", "registrations": 0, "ftds": 0,
               "ftd_amount": 0.0, "revenue": 0.0, "marketing_spend": 0.0,
               "cpa": 0.0, "roi_pct": 0.0, "avg_ftd_value": 0.0}
    else:
        s = affiliate_summary
        total_spend  = float(s["marketing_spend"].sum())
        total_ftds   = int(s["ftds"].sum())
        total_rev    = float(s["revenue"].sum())
        total_ftd_v  = float(s["ftd_amount"].sum())
        total_regs   = int(s["registrations"].sum())
        aff = {
            "channel":        "Affiliates",
            "registrations":  total_regs,
            "ftds":           total_ftds,
            "ftd_amount":     round(total_ftd_v, 2),
            "revenue":        round(total_rev, 2),
            "marketing_spend": round(total_spend, 2),
            "cpa":            round(total_spend / total_ftds, 2) if total_ftds > 0 else 0.0,
            "roi_pct":        round((total_rev - total_spend) / total_spend * 100, 1) if total_spend > 0 else 0.0,
            "avg_ftd_value":  round(total_ftd_v / total_ftds, 2) if total_ftds > 0 else 0.0,
        }

    placeholder = {"registrations": 0, "ftds": 0, "ftd_amount": 0.0,
                   "revenue": 0.0, "marketing_spend": 0.0, "cpa": 0.0,
                   "roi_pct": 0.0, "avg_ftd_value": 0.0}
    channels = [
        aff,
        {"channel": "Google Ads",  **placeholder},
        {"channel": "Meta",        **placeholder},
        {"channel": "Influencers", **placeholder},
        {"channel": "Organic",     **placeholder},
    ]
    return channels
