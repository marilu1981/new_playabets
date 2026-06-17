"""
app.py — Playa Bets Local Analytics API
========================================
FastAPI backend that serves pre-computed Parquet files from data/serving/.

All endpoints are READ-ONLY and serve from local Parquet files.
No live DWH connection is made here — data is refreshed by the scheduler.

Run:
    uvicorn backend.app:app --reload --port 8080
"""
from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("playabets.api")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.app_config import ENABLE_TRANSACTIONS
from backend.core.cache import (
    _PARQUET_CACHE,
    _COHORT_CACHE,
    _SERVING,
    _RAW,
    DATA_PATH,
    RFM_USERS_PATH,
    TX_DAILY_PATH,
    BONUS_DAILY_PATH,
    FTD_DAILY_PATH,
    FTD_REG_MONTH_DAILY_PATH,
    ACTIVES_MONTHLY_PATH,
    CASINO_DAILY_PATH,
)
from backend.routers import kpis, users, sportsbook, transactions, bonus, casino, product, admin

import pandas as pd

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Playa Bets Analytics API", version="0.3")


@app.middleware("http")
async def _log_requests(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    logger.info("%s %s %d %.0fms", request.method, request.url.path, response.status_code, ms)
    return response


# ---------------------------------------------------------------------------
# CORS — only used when the frontend is NOT behind the same-origin reverse proxy.
# In production (Azure Static Web Apps + Container Apps), the reverse proxy
# handles routing so CORS is never triggered. This config is for local dev only.
# ---------------------------------------------------------------------------
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
_ALLOWED_ORIGINS = (
    ["*"]
    if not _cors_env or _cors_env == "*"
    else [o.strip() for o in _cors_env.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=False,          # No cookies — we use Authorization header
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-API-Key", "X-User-Email"],
)


# ---------------------------------------------------------------------------
# API-key authentication middleware
# Set API_KEY env var to enable. If unset, auth is disabled (local dev).
# Pass the key via "Authorization: Bearer <key>" or "X-API-Key: <key>" header.
# ---------------------------------------------------------------------------
_API_KEY = os.environ.get("API_KEY")
_AUTH_EXEMPT_PATHS = {"/", "/health", "/docs", "/openapi.json"}


class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not _API_KEY:                          # auth disabled in dev
            return await call_next(request)
        if request.method == "OPTIONS":
            return await call_next(request)
        if request.url.path in _AUTH_EXEMPT_PATHS:
            return await call_next(request)

        key = request.headers.get("x-api-key") or ""
        auth = request.headers.get("authorization") or ""
        if auth.startswith("Bearer "):
            key = key or auth[7:]

        if key != _API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing API key"})

        return await call_next(request)


app.add_middleware(APIKeyMiddleware)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(kpis.router)
app.include_router(users.router)
app.include_router(sportsbook.router)
app.include_router(transactions.router)
app.include_router(bonus.router)
app.include_router(casino.router)
app.include_router(product.router)
app.include_router(admin.router)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "ok": True,
        "environment": os.environ.get("PLAYABETS_ENV", "local"),
        "serving_root": str(_SERVING),
        "raw_root": str(_RAW),
        "transactions_enabled": ENABLE_TRANSACTIONS,
        "daily_kpis": DATA_PATH.exists(),
        "rfm_users": RFM_USERS_PATH.exists(),
        "tx_daily": TX_DAILY_PATH.exists(),
        "bonus_daily": BONUS_DAILY_PATH.exists(),
        "ftd_daily": FTD_DAILY_PATH.exists(),
        "ftd_reg_month_daily": FTD_REG_MONTH_DAILY_PATH.exists(),
        "actives_monthly": ACTIVES_MONTHLY_PATH.exists(),
        "casino_daily": CASINO_DAILY_PATH.exists(),
    }


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
@app.post("/cache/clear")
def cache_clear():
    _PARQUET_CACHE.clear()
    _COHORT_CACHE["fingerprint"] = None
    _COHORT_CACHE["df"] = pd.DataFrame()
    _COHORT_CACHE["max_observed_date"] = None
    return {"ok": True}


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    return {"message": "Playa Bets API v0.2 — see /docs for endpoints"}
