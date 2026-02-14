from __future__ import annotations
from datetime import date, datetime
from pathlib import Path
from typing import Optional, Literal
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# Path relative to project root (parent of backend/)
_DATA_DIR = Path(__file__).resolve().parents[1]
DATA_PATH = _DATA_DIR / "data" / "serving" / "daily_kpis.parquet"
RFM_USERS_PATH = _DATA_DIR / "data" / "serving" / "rfm_users.parquet"
RFM_ROLLING_PATH = _DATA_DIR / "data" / "serving" / "rfm_rolling_daily.parquet"

# --- Simple mtime-aware parquet cache ---
_PARQUET_CACHE: dict[str, dict] = {}


def load_parquet_cached(path: Path, key: str) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()

    mtime = path.stat().st_mtime
    hit = _PARQUET_CACHE.get(key)

    if (hit is None) or (hit["mtime"] != mtime):
        df = pd.read_parquet(path)
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.date
            df = df.sort_values("date")
        _PARQUET_CACHE[key] = {"mtime": mtime, "df": df}

    return _PARQUET_CACHE[key]["df"].copy()


def load_daily_df() -> pd.DataFrame:
    return load_parquet_cached(DATA_PATH, "daily_kpis")

app = FastAPI(title="Playa Bets Local API", version="0.1")

# Allow frontend dev servers (Vite default 8080, Next.js 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _filter_range(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    if df.empty or "date" not in df.columns:
        return df
    return df[(df["date"] >= start) & (df["date"] <= end)]

@app.get("/health")
def health():
    return {"ok": True, "data_file": str(DATA_PATH), "data_exists": DATA_PATH.exists()}


@app.get("/kpis")
def kpis(
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
):
    """
    Returns KPI totals over the selected date range.
    Assumes daily_kpis.parquet has these columns:
      date, registrations, actives_sports, turnover, ggr
    (others can be added later: deposits, withdrawals, ftds, bonus_spent, ngr)
    """
    df = load_daily_df()
    d = _filter_range(df, start, end)

    def s(col: str) -> float:
        return float(d[col].sum()) if col in d.columns else 0.0

    payload = {
        "range": {"start": str(start), "end": str(end)},
        "registrations": int(s("registrations")),
        "actives": int(s("actives_sports")),      # v1: sports actives only
        "turnover": s("turnover"),
        "ggr": s("ggr"),
        # placeholders until transactions/bonus confirmed
        "ftds": 0,
        "deposits": 0.0,
        "withdrawals": 0.0,
        "bonus_spent": 0.0,
        "ngr": 0.0,
    }
    return payload


@app.get("/timeseries/revenue")
def revenue_timeseries(
    start: date = Query(...),
    end: date = Query(...),
    metric: Literal["turnover", "ggr", "registrations", "actives_sports"] = Query("ggr"),
):
    """
    Returns daily series for a selected metric.
    """
    df = load_daily_df()
    d = _filter_range(df, start, end)
    if d.empty or "date" not in d.columns or metric not in d.columns:
        return {"metric": metric, "series": []}
    d = d.sort_values("date")
    series = [{"date": str(x), "value": float(v)} for x, v in zip(d["date"], d[metric])]
    return {"metric": metric, "series": series}


@app.get("/timeseries/acquisition")
def acquisition_timeseries(
    start: date = Query(...),
    end: date = Query(...),
):
    """
    Returns daily registrations + ftds series.
    (ftds is placeholder 0 until we wire transactions.)
    """
    df = load_daily_df()
    d = _filter_range(df, start, end)
    if d.empty or "date" not in d.columns:
        return {"registrations": [], "ftds": []}
    d = d.sort_values("date")
    regs = [{"date": str(x), "value": int(v)} for x, v in zip(d["date"], d["registrations"] if "registrations" in d.columns else [0] * len(d))]
    ftds = [{"date": str(x), "value": 0} for x in d["date"]]

    return {"registrations": regs, "ftds": ftds}


@app.get("/kpis/latest")
def kpis_latest():
    """Return the most recent row of KPIs."""
    df = load_daily_df()
    if df.empty:
        raise HTTPException(404, "KPI table is empty")
    row = df.iloc[-1].to_dict()
    # convert date and numpy types to JSON‑friendly
    return {k: (str(v) if k == "date" else (v.item() if hasattr(v, "item") else v)) for k, v in row.items()}


@app.get("/kpis/series")
def kpis_series(
    metric: str = Query(..., description="Column name (e.g. 'revenue')"),
    days: int = Query(30, ge=1, le=400),
):
    """Return a time‑series for a single metric."""
    df = load_daily_df()
    if metric not in df.columns:
        raise HTTPException(400, f"Unknown metric '{metric}'. Available: {list(df.columns)}")
    tail_df = df.tail(days)
    points = [
        {
            "date": str(r["date"]),
            "value": float(r[metric]) if pd.notna(r[metric]) else None,
        }
        for _, r in tail_df.iterrows()
    ]
    return {"metric": metric, "days": days, "points": points}


@app.get("/kpis/rolling")
def kpis_rolling(
    start: Optional[date] = Query(None, description="YYYY-MM-DD"),
    end: Optional[date] = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(180, ge=1, le=2000),
):
    """
    Returns rows from rfm_rolling_daily.parquet for charts.
    """
    df = load_parquet_cached(RFM_ROLLING_PATH, "rfm_rolling_daily")
    if df.empty:
        return {"path": str(RFM_ROLLING_PATH), "rows": []}

    d = df
    if start and "date" in d.columns:
        # Filter by start date (and optionally end date)
        if end:
            d = _filter_range(d, start, end).sort_values("date")
        else:
            d = d[d["date"] >= start].sort_values("date")
    elif "date" in d.columns:
        d = d.sort_values("date").tail(limit)
    else:
        d = d.sort_values("date").tail(limit)

    return {"path": str(RFM_ROLLING_PATH), "rows": d.to_dict(orient="records")}


@app.get("/rfm/segments")
def rfm_segments():
    """
    Snapshot: counts of users by RFM segment from rfm_users.parquet
    """
    df = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    if df.empty or "segment" not in df.columns:
        return {"path": str(RFM_USERS_PATH), "segments": []}

    counts = df["segment"].astype(str).value_counts().reset_index()
    counts.columns = ["segment", "users"]
    return {"path": str(RFM_USERS_PATH), "segments": counts.to_dict(orient="records")}


@app.get("/rfm/users")
def rfm_users(
    segment: Optional[str] = Query(None, description="e.g. Champions"),
    limit: int = Query(200, ge=1, le=5000),
    columns: Optional[str] = Query(None, description="Comma-separated list of columns"),
):
    """
    Drilldown list of users from rfm_users.parquet.
    """
    df = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    if df.empty:
        return {"path": str(RFM_USERS_PATH), "users": []}

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

    d = d.head(limit)
    return {"path": str(RFM_USERS_PATH), "users": d.to_dict(orient="records")}


@app.get("/kpis/daily")
def kpis_daily(
    start: Optional[date] = Query(None, description="YYYY-MM-DD"),
    end: Optional[date] = Query(None, description="YYYY-MM-DD"),
    metrics: Optional[str] = Query(None, description="Comma-separated list of metrics"),
):
    """
    Returns daily KPI rows from daily_kpis.parquet.
    """
    df = load_daily_df()
    if df.empty:
        return {"path": str(DATA_PATH), "rows": []}

    d = df.copy()
    if start and end and "date" in d.columns:
        d = _filter_range(d, start, end)
    
    d = d.sort_values("date")
    
    if metrics:
        wanted = [c.strip() for c in metrics.split(",") if c.strip()]
        # Always include date
        keep = ["date"] + [c for c in wanted if c in d.columns and c != "date"]
        if keep:
            d = d[keep]
    
    return {"path": str(DATA_PATH), "rows": d.to_dict(orient="records")}


@app.post("/cache/clear")
def cache_clear():
    _PARQUET_CACHE.clear()
    return {"ok": True}


@app.get("/")
def root():
    return {"message": "OK. Try /health or /docs"}
    