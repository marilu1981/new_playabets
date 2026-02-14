from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Optional, Literal

import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "serving" / "daily_kpis.parquet"

app = FastAPI(title="Playa Bets Local API", version="0.1")

# Allow Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_daily() -> pd.DataFrame:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Missing {DATA_PATH}. Create it first (we can generate from users+betslips)."
        )
    df = pd.read_parquet(DATA_PATH)
    # enforce date type
    df["date"] = pd.to_datetime(df["date"]).dt.date
    return df


def _filter_range(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    # inclusive range
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
    df = _load_daily()
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
    df = _load_daily()
    d = _filter_range(df, start, end).sort_values("date")
    if metric not in d.columns:
        return {"metric": metric, "series": []}

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
    df = _load_daily()
    d = _filter_range(df, start, end).sort_values("date")

    regs = [{"date": str(x), "value": int(v)} for x, v in zip(d["date"], d.get("registrations", 0))]
    # placeholder until later
    ftds = [{"date": str(x), "value": 0} for x in d["date"]]

    return {"registrations": regs, "ftds": ftds}
