"""
app.py — Playa Bets Local Analytics API
========================================
FastAPI backend that serves pre-computed Parquet files from data/serving/.

All endpoints are READ-ONLY and serve from local Parquet files.
No live DWH connection is made here — data is refreshed by the scheduler.

Run:
    uvicorn backend.app:app --reload --port 8080

Endpoints:
  /health
  /kpis                    — overview KPIs for a date range
  /timeseries/revenue      — daily time-series for a metric
  /timeseries/registrations
  /kpis/latest
  /kpis/series
  /kpis/rolling
  /kpis/daily
  /rfm/segments
  /rfm/users
  /transactions/kpis       — deposit / withdrawal KPIs
  /transactions/trend      — daily deposit/withdrawal series
  /bonus/kpis              — bonus summary
  /bonus/daily             — daily bonus credited series
  /casino/kpis             — casino KPI summary
  /casino/daily            — daily casino series
  /casino/providers        — by-provider breakdown
  /casino/types            — by-type breakdown
  /commissions/summary     — commission totals + top agents
  /commissions/trend       — daily commission series
  /cache/clear
"""
from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Optional, Literal

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_ROOT = Path(__file__).resolve().parents[1]


def _first_existing_path(*paths: Path) -> Path:
    for path in paths:
        if path.exists():
            return path
    return paths[0]


_SERVING = _first_existing_path(
    _ROOT / "data" / "serving",
    _ROOT / "backend" / "data" / "serving",
)
_RAW = _first_existing_path(
    _ROOT / "data" / "raw",
    _ROOT / "backend" / "data" / "raw",
)

DATA_PATH        = _SERVING / "daily_kpis.parquet"
RFM_USERS_PATH   = _SERVING / "rfm_users.parquet"
RFM_ROLLING_PATH = _SERVING / "rfm_rolling_daily.parquet"

# Domain-specific serving files (written by build_daily_kpis or domain scripts)
TX_DAILY_PATH          = _SERVING / "transactions_daily.parquet"
BONUS_DAILY_PATH       = _SERVING / "bonus_daily.parquet"
CASINO_DAILY_PATH      = _SERVING / "casino_daily.parquet"
COMMISSIONS_DAILY_PATH = _SERVING / "commissions_daily.parquet"

# Raw bonus reference files (full-refresh, written by incremental_bonus.py)
CAMPAIGNS_PATH = _first_existing_path(
    _RAW / "bonus" / "campaigns_full.parquet",
    _RAW / "bonus" / "campaigns_latest.parquet",
)
FREEBETS_PATH = _first_existing_path(
    _RAW / "bonus" / "freebets_full.parquet",
    _RAW / "bonus" / "freebets_latest.parquet",
)

# Raw commission snapshots
SPORT_DIRECT_PATH    = _RAW / "commissions" / "sport_direct_full.parquet"
SPORT_NETWORK_PATH   = _RAW / "commissions" / "sport_network_full.parquet"
CASINO_DIRECT_PATH   = _RAW / "commissions" / "casino_direct_full.parquet"
CASINO_NETWORK_PATH  = _RAW / "commissions" / "casino_network_full.parquet"

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
_PARQUET_CACHE: dict[str, dict] = {}


def load_parquet_cached(path: Path, key: str) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    mtime = path.stat().st_mtime
    hit = _PARQUET_CACHE.get(key)
    if hit is None or hit["mtime"] != mtime:
        df = pd.read_parquet(path)
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
            df = df.sort_values("date")
        _PARQUET_CACHE[key] = {"mtime": mtime, "df": df}
    return _PARQUET_CACHE[key]["df"].copy()


def load_daily_df() -> pd.DataFrame:
    return load_parquet_cached(DATA_PATH, "daily_kpis")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Playa Bets Local API", version="0.2")

# ---------------------------------------------------------------------------
# CORS — only used when the frontend is NOT behind the same-origin reverse proxy.
# In production (Azure Static Web Apps + Container Apps), the reverse proxy
# handles routing so CORS is never triggered. This config is for local dev only.
# ---------------------------------------------------------------------------
_ALLOWED_ORIGINS = [
    "http://localhost:3000",   # Vite dev server
    "http://127.0.0.1:3000",
    # Add production domain here when deploying, e.g.:
    # "https://dashboard.playabets.com",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,          # No cookies — we use Authorization header
    allow_methods=["GET", "OPTIONS"],  # Read-only API
    allow_headers=["Content-Type", "Authorization", "Accept"],
)


def _filter_range(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    if df.empty or "date" not in df.columns:
        return df
    return df[(df["date"] >= start) & (df["date"] <= end)]


def _s(df: pd.DataFrame, col: str) -> float:
    return float(df[col].sum()) if col in df.columns else 0.0


def _i(df: pd.DataFrame, col: str) -> int:
    return int(df[col].sum()) if col in df.columns else 0


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "ok": True,
        "daily_kpis": DATA_PATH.exists(),
        "rfm_users": RFM_USERS_PATH.exists(),
        "tx_daily": TX_DAILY_PATH.exists(),
        "bonus_daily": BONUS_DAILY_PATH.exists(),
        "casino_daily": CASINO_DAILY_PATH.exists(),
        "commissions_daily": COMMISSIONS_DAILY_PATH.exists(),
    }


# ---------------------------------------------------------------------------
# Overview KPIs
# ---------------------------------------------------------------------------
@app.get("/kpis")
def kpis(
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
):
    df = _filter_range(load_daily_df(), start, end)
    tx = _filter_range(load_parquet_cached(TX_DAILY_PATH, "tx_daily"), start, end)
    bonus = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)

    return {
        "range": {"start": str(start), "end": str(end)},
        "registrations": _i(df, "registrations"),
        "actives": _i(df, "actives_sports"),
        "turnover": _s(df, "placed_stake"),
        "ggr": _s(df, "ggr"),
        "ngr": _s(df, "ggr") - _s(bonus, "bonus_credited"),
        "ftds": 0,  # requires dedicated FTD logic — placeholder
        "deposits": _s(tx, "deposits"),
        "withdrawals": _s(tx, "withdrawals"),
        "net_deposits": _s(tx, "net_deposits"),
        "bonus_spent": _s(bonus, "bonus_credited"),
    }


# ---------------------------------------------------------------------------
# Time-series
# ---------------------------------------------------------------------------
@app.get("/timeseries/revenue")
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
            {"date": str(r["date"]), "value": float(r[metric]) if pd.notna(r[metric]) else None}
            for _, r in d.iterrows()
        ],
    }


@app.get("/timeseries/registrations")
def registrations_timeseries(
    start: date = Query(...),
    end: date = Query(...),
):
    df = load_daily_df()
    d = _filter_range(df, start, end).sort_values("date")
    regs = [{"date": str(x), "value": int(v)} for x, v in zip(d["date"], d.get("registrations", [0] * len(d)))]
    ftds = [{"date": str(x), "value": 0} for x in d["date"]]
    return {"registrations": regs, "ftds": ftds}


# ---------------------------------------------------------------------------
# KPI series / rolling / latest (legacy endpoints kept for compatibility)
# ---------------------------------------------------------------------------
@app.get("/kpis/latest")
def kpis_latest():
    df = load_daily_df()
    if df.empty:
        raise HTTPException(404, "KPI table is empty")
    row = df.iloc[-1].to_dict()
    return {k: (str(v) if k == "date" else (v.item() if hasattr(v, "item") else v)) for k, v in row.items()}


@app.get("/kpis/series")
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
            {"date": str(r["date"]), "value": float(r[metric]) if pd.notna(r[metric]) else None}
            for _, r in tail_df.iterrows()
        ],
    }


@app.get("/kpis/rolling")
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


@app.get("/kpis/daily")
def kpis_daily(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    metrics: Optional[str] = Query(None),
):
    df = load_daily_df()
    if df.empty:
        return {"path": str(DATA_PATH), "rows": []}
    d = df.copy()
    if start and end and "date" in d.columns:
        d = _filter_range(d, start, end)
    d = d.sort_values("date")
    if metrics:
        wanted = [c.strip() for c in metrics.split(",") if c.strip()]
        keep = ["date"] + [c for c in wanted if c in d.columns and c != "date"]
        if keep:
            d = d[keep]
    return {"path": str(DATA_PATH), "rows": d.to_dict(orient="records")}


# ---------------------------------------------------------------------------
# RFM
# ---------------------------------------------------------------------------
@app.get("/rfm/segments")
def rfm_segments():
    df = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    if df.empty or "segment" not in df.columns:
        return {"segments": []}
    counts = df["segment"].astype(str).value_counts().reset_index()
    counts.columns = ["segment", "users"]
    return {"segments": counts.to_dict(orient="records")}


@app.get("/rfm/users")
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
    return {"users": d.head(limit).to_dict(orient="records")}


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------
@app.get("/transactions/kpis")
def transactions_kpis(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(TX_DAILY_PATH, "tx_daily"), start, end)
    return {
        "range": {"start": str(start), "end": str(end)},
        "deposits": _s(df, "deposits"),
        "withdrawals": _s(df, "withdrawals"),
        "net_deposits": _s(df, "net_deposits"),
        "tx_count": _i(df, "tx_count"),
        "unique_depositors": _i(df, "unique_depositors"),
        "tx_count_accepted": _i(df, "tx_count_accepted"),
        "tx_count_pending": _i(df, "tx_count_pending"),
        "tx_count_system": _i(df, "tx_count_system"),
        "tx_count_other_status": _i(df, "tx_count_other_status"),
    }


@app.get("/transactions/trend")
def transactions_trend(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(TX_DAILY_PATH, "tx_daily"), start, end)
    if df.empty:
        return {"deposits": [], "withdrawals": []}
    df = df.sort_values("date")
    return {
        "deposits": [{"date": str(r["date"]), "value": float(r.get("deposits", 0))} for _, r in df.iterrows()],
        "withdrawals": [{"date": str(r["date"]), "value": float(r.get("withdrawals", 0))} for _, r in df.iterrows()],
    }


# ---------------------------------------------------------------------------
# Bonus
# ---------------------------------------------------------------------------
@app.get("/bonus/kpis")
def bonus_kpis():
    campaigns = load_parquet_cached(CAMPAIGNS_PATH, "campaigns")
    freebets  = load_parquet_cached(FREEBETS_PATH, "freebets")

    total_campaigns = int(len(campaigns)) if not campaigns.empty else 0
    active_campaigns = 0
    if not campaigns.empty and "CampaignStatus" in campaigns.columns:
        active_campaigns = int((campaigns["CampaignStatus"].str.lower() == "active").sum())
    elif not campaigns.empty and "CampaignStatusID" in campaigns.columns:
        active_campaigns = int((campaigns["CampaignStatusID"] == 1).sum())

    total_freebets  = int(len(freebets)) if not freebets.empty else 0
    freebet_amount  = float(freebets["Amount"].sum()) if not freebets.empty and "Amount" in freebets.columns else 0.0

    return {
        "total_campaigns": total_campaigns,
        "active_campaigns": active_campaigns,
        "total_freebets": total_freebets,
        "total_freebet_amount": freebet_amount,
    }


@app.get("/bonus/daily")
def bonus_daily(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)
    if df.empty:
        return {"points": []}
    df = df.sort_values("date")
    return {
        "points": [
            {"date": str(r["date"]), "bonus_credited": float(r.get("bonus_credited", 0))}
            for _, r in df.iterrows()
        ]
    }


@app.get("/bonus/campaigns")
def bonus_campaigns(status: Optional[str] = Query(None)):
    campaigns = load_parquet_cached(CAMPAIGNS_PATH, "campaigns")
    if campaigns.empty:
        return {"campaigns": []}
    d = campaigns.copy()
    if status and "CampaignStatus" in d.columns:
        d = d[d["CampaignStatus"].str.lower() == status.lower()]
    return {"campaigns": d.to_dict(orient="records")}


# ---------------------------------------------------------------------------
# Casino
# ---------------------------------------------------------------------------
@app.get("/casino/kpis")
def casino_kpis(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)
    return {
        "range": {"start": str(start), "end": str(end)},
        "casino_stake": _s(df, "casino_stake"),
        "casino_winnings": _s(df, "casino_winnings"),
        "casino_ggr": _s(df, "casino_ggr"),
        "casino_bets": _i(df, "casino_bets"),
        "casino_actives": _i(df, "casino_actives"),
    }


@app.get("/casino/daily")
def casino_daily(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)
    if df.empty:
        return {"points": []}
    df = df.sort_values("date")
    return {
        "points": [
            {
                "date": str(r["date"]),
                "stake": float(r.get("casino_stake", 0)),
                "winnings": float(r.get("casino_winnings", 0)),
                "ggr": float(r.get("casino_ggr", 0)),
            }
            for _, r in df.iterrows()
        ]
    }


@app.get("/casino/providers")
def casino_providers(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    """Provider breakdown from raw casino parquet files."""
    from pathlib import Path as _P
    import glob

    raw_files = sorted((_ROOT / "data" / "raw" / "casino").glob("casino_increment_*.parquet"))
    if not raw_files:
        return {"providers": []}

    df = pd.concat([pd.read_parquet(f) for f in raw_files], ignore_index=True)
    if start and end and "PlacementDate" in df.columns:
        df["_d"] = pd.to_datetime(df["PlacementDate"], errors="coerce").dt.date
        df = df[(df["_d"] >= start) & (df["_d"] <= end)]

    if "ProviderName" not in df.columns:
        return {"providers": []}

    out = (
        df.groupby("ProviderName")
        .agg(stake=("Stake", "sum"), winnings=("Winnings", "sum"), bets=("BetsNumber", "sum"))
        .reset_index()
    )
    out["ggr"] = out["stake"] - out["winnings"]
    return {"providers": out.sort_values("ggr", ascending=False).to_dict(orient="records")}


@app.get("/casino/types")
def casino_types(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    raw_files = sorted((_ROOT / "data" / "raw" / "casino").glob("casino_increment_*.parquet"))
    if not raw_files:
        return {"types": []}

    df = pd.concat([pd.read_parquet(f) for f in raw_files], ignore_index=True)
    if start and end and "PlacementDate" in df.columns:
        df["_d"] = pd.to_datetime(df["PlacementDate"], errors="coerce").dt.date
        df = df[(df["_d"] >= start) & (df["_d"] <= end)]

    if "CasinoType" not in df.columns:
        return {"types": []}

    out = (
        df.groupby("CasinoType")
        .agg(stake=("Stake", "sum"), winnings=("Winnings", "sum"))
        .reset_index()
    )
    out["ggr"] = out["stake"] - out["winnings"]
    return {"types": out.sort_values("ggr", ascending=False).to_dict(orient="records")}


# ---------------------------------------------------------------------------
# Commissions
# ---------------------------------------------------------------------------
@app.get("/commissions/summary")
def commissions_summary(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    df = load_parquet_cached(COMMISSIONS_DAILY_PATH, "commissions_daily")
    if start and end:
        df = _filter_range(df, start, end)

    sport_direct   = load_parquet_cached(SPORT_DIRECT_PATH, "sport_direct")
    sport_network  = load_parquet_cached(SPORT_NETWORK_PATH, "sport_network")
    casino_direct  = load_parquet_cached(CASINO_DIRECT_PATH, "casino_direct")
    casino_network = load_parquet_cached(CASINO_NETWORK_PATH, "casino_network")

    # Combine all commission frames for top-agents
    frames = []
    for d, tag in [
        (sport_direct, "sport_direct"), (sport_network, "sport_network"),
        (casino_direct, "casino_direct"), (casino_network, "casino_network"),
    ]:
        if not d.empty:
            c = d.copy()
            c["_source"] = tag
            frames.append(c)

    top_agents: list[dict] = []
    total_agents = 0
    if frames:
        combined = pd.concat(frames, ignore_index=True)
        if "UserID" in combined.columns and "Commissions" in combined.columns:
            combined["Commissions"] = pd.to_numeric(combined["Commissions"], errors="coerce").fillna(0)
            total_agents = int(combined["UserID"].nunique())
            ta = (
                combined.groupby("UserID")["Commissions"]
                .sum()
                .sort_values(ascending=False)
                .head(10)
                .reset_index()
            )
            top_agents = [
                {"user_id": int(r["UserID"]), "commissions": float(r["Commissions"])}
                for _, r in ta.iterrows()
            ]

    return {
        "total_commissions": _s(df, "commissions"),
        "sport_commissions": _s(df, "commissions"),  # split available in trend
        "total_agents": total_agents,
        "top_agents": top_agents,
    }


@app.get("/commissions/trend")
def commissions_trend(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(COMMISSIONS_DAILY_PATH, "commissions_daily"), start, end)
    if df.empty:
        return {"points": []}
    df = df.sort_values("date")
    return {
        "points": [
            {
                "date": str(r["date"]),
                "commissions": float(r.get("commissions", 0)),
                "stake": float(r.get("stake", 0)),
            }
            for _, r in df.iterrows()
        ]
    }


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
@app.post("/cache/clear")
def cache_clear():
    _PARQUET_CACHE.clear()
    return {"ok": True}


@app.get("/")
def root():
    return {"message": "Playa Bets API v0.2 — see /docs for endpoints"}
