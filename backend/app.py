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
  /timeseries/conversion-cohorts
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
  /betting/betslips-by-status
  /betting/betslips-by-type
  /commissions/summary     — commission totals + top agents
  /commissions/trend       — daily commission series
  /cache/clear
"""
from __future__ import annotations

import logging
import sys
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Literal

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("playabets.api")
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.app_config import ENABLE_TRANSACTIONS, RAW_ROOT, SERVING_ROOT
from src.kpis.io_utils import normalize_cols, read_all_parquets, to_dt

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_ROOT = PROJECT_ROOT


def _first_existing_path(*paths: Path) -> Path:
    for path in paths:
        if path.exists():
            return path
    return paths[0]


_SERVING = _first_existing_path(
    SERVING_ROOT,
    _ROOT / "data" / "serving",
    _ROOT / "backend" / "data" / "serving",
)
_RAW = _first_existing_path(
    RAW_ROOT,
    _ROOT / "data" / "raw",
    _ROOT / "backend" / "data" / "raw",
)
USERS_RAW = _first_existing_path(_RAW / "users", _RAW / "Users")
BETSLIPS_RAW = _first_existing_path(_RAW / "betslips", _RAW / "BetSlips")

DATA_PATH        = _SERVING / "daily_kpis.parquet"
RFM_USERS_PATH          = _SERVING / "rfm_users.parquet"
RFM_ROLLING_PATH        = _SERVING / "rfm_rolling_daily.parquet"
RFM_MONTHLY_PATH        = _SERVING / "rfm_monthly_snapshots.parquet"

# Domain-specific serving files (written by build_daily_kpis or domain scripts)
TX_DAILY_PATH               = _SERVING / "transactions_daily.parquet"
BONUS_DAILY_PATH            = _SERVING / "bonus_daily.parquet"
FTD_DAILY_PATH              = _SERVING / "ftd_daily.parquet"
FTD_REG_MONTH_DAILY_PATH    = _SERVING / "ftd_reg_month_daily.parquet"
ACTIVES_MONTHLY_PATH        = _SERVING / "actives_monthly.parquet"
CASINO_DAILY_PATH           = _SERVING / "casino_daily.parquet"
CASINO_PROVIDERS_DAILY_PATH = _SERVING / "casino_providers_daily.parquet"
SELFEXCLUSIONS_PATH    = _RAW / "selfexclusions" / "selfexclusions_current_latest.parquet"

# Earliest date for which all data sources (casino, FTD, bonus, sportsbook) are complete.
# Pre-Jan 2026 rows exist in daily_kpis but have zero casino/FTD/bonus — exclude them.
DATA_START_DATE = date(2026, 1, 1)

# Filter mappings (UI -> data values)
_COUNTRY_MAP = {
    "ng": "Nigeria",
    "gh": "Ghana",
    "ke": "Kenya",
    "ug": "Uganda",
    "zm": "Zambia",
    "za": "South Africa",
}
_TERRITORY_COUNTRIES = {
    "west_africa": {"Nigeria", "Ghana"},
    "east_africa": {"Kenya", "Uganda"},
    "southern_africa": {"Zambia", "South Africa"},
}
_STATUS_ALIASES = {
    "active": "enabled",
    "inactive": "disabled",
    "blocked": "frozen",
    "dormant": "dormant",
}

# Raw bonus reference files (full-refresh, written by incremental_bonus.py)
def _prefer_latest_parquet(base_dir: Path, prefix: str) -> Path:
    latest_candidates = sorted(
        (base_dir.glob(f"{prefix}_latest*.parquet")),
        key=lambda p: p.stat().st_mtime if p.exists() else 0,
    )
    if latest_candidates:
        return latest_candidates[-1]
    fallback_full = base_dir / f"{prefix}_full.parquet"
    return fallback_full if fallback_full.exists() else base_dir / f"{prefix}_latest.parquet"

CAMPAIGNS_PATH = _prefer_latest_parquet(_RAW / "bonus", "campaigns")
FREEBETS_PATH = _prefer_latest_parquet(_RAW / "bonus", "freebets")


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
_PARQUET_CACHE: dict[str, dict] = {}
_COHORT_CACHE: dict[str, object] = {
    "fingerprint": None,
    "df": pd.DataFrame(),
    "max_observed_date": None,
}


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


def _raw_files_fingerprint(files: list[Path]) -> tuple[tuple[str, int, int], ...]:
    return tuple((f.name, int(f.stat().st_mtime), int(f.stat().st_size)) for f in files)


def load_betslips_raw() -> pd.DataFrame:
    base = BETSLIPS_RAW
    if not base.exists():
        return pd.DataFrame()

    if base.is_dir():
        inc_files = sorted(base.glob("betslips_increment_*.parquet"))
        latest_files = sorted(base.glob("betslips_latest*.parquet"))
        full_file = base / "betslips_full.parquet"

        if full_file.exists() and inc_files:
            files = [full_file] + inc_files
            key = "betslips_raw_full_plus_inc"
        elif inc_files:
            files = inc_files
            key = "betslips_raw_increment"
        elif latest_files:
            files = [latest_files[-1]]
            key = "betslips_raw_latest"
        elif full_file.exists():
            files = [full_file]
            key = "betslips_raw_full"
        else:
            files = sorted(base.glob("*.parquet"))
            if not files:
                return pd.DataFrame()
            key = "betslips_raw_any"

        fingerprint = _raw_files_fingerprint(files)
        hit = _PARQUET_CACHE.get(key)
        if hit is None or hit.get("fingerprint") != fingerprint:
            if len(files) == 1:
                df = pd.read_parquet(files[0])
            else:
                df = pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)
            _PARQUET_CACHE[key] = {"fingerprint": fingerprint, "df": df}
        return _PARQUET_CACHE[key]["df"].copy()

    return load_parquet_cached(base, "betslips_raw_file")


def _normalize_cols(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    out = df.copy()
    out.columns = [str(c).strip() for c in out.columns]
    return out, {str(c).lower(): str(c) for c in out.columns}


def _normalize_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    v = str(value).strip()
    if not v or v.lower() == "all":
        return None
    return v


def _normalize_status(value: Optional[str]) -> Optional[str]:
    v = _normalize_value(value)
    if not v:
        return None
    key = v.strip().lower()
    return _STATUS_ALIASES.get(key, key)


def _country_set(country: Optional[str]) -> Optional[set[str]]:
    v = _normalize_value(country)
    if not v:
        return None
    key = v.lower()
    mapped = _COUNTRY_MAP.get(key, v)
    return {mapped}


def _territory_set(territory: Optional[str]) -> Optional[set[str]]:
    v = _normalize_value(territory)
    if not v:
        return None
    key = v.lower().replace(" ", "_")
    return _TERRITORY_COUNTRIES.get(key)


def _load_users_for_filters() -> pd.DataFrame:
    users = _load_latest_users()
    if users.empty:
        return users
    users, mapping = normalize_cols(users)
    rename = {}
    uid_col = mapping.get("userid")
    if uid_col:
        rename[uid_col] = "userid"
    status_col = mapping.get("userstatus")
    if status_col:
        rename[status_col] = "userstatus"
    country_col = mapping.get("country")
    if country_col:
        rename[country_col] = "country"
    creation_col = mapping.get("creationdate")
    if creation_col:
        rename[creation_col] = "creationdate"
    lastlogin_col = mapping.get("lastlogin")
    if lastlogin_col:
        rename[lastlogin_col] = "lastlogin"
    if rename:
        users = users.rename(columns=rename)
    return users


def _apply_user_filters(
    users: pd.DataFrame,
    territory: Optional[str] = None,
    country: Optional[str] = None,
    customer_status: Optional[str] = None,
) -> pd.DataFrame:
    if users.empty:
        return users
    countries = _territory_set(territory)
    country_single = _country_set(country)
    if country_single:
        countries = country_single if countries is None else countries & country_single
    status = _normalize_status(customer_status)

    filtered = users.copy()
    if countries is not None:
        if "country" not in filtered.columns:
            return filtered.iloc[0:0]
        allowed = {str(c).strip().lower() for c in countries}
        filtered = filtered[filtered["country"].astype(str).str.strip().str.lower().isin(allowed)]
    if status:
        if "userstatus" not in filtered.columns:
            return filtered.iloc[0:0]
        filtered = filtered[filtered["userstatus"].astype(str).str.strip().str.lower() == status]
    return filtered


def _get_allowed_user_ids(
    territory: Optional[str] = None,
    country: Optional[str] = None,
    customer_status: Optional[str] = None,
    current_segment: Optional[str] = None,
) -> Optional[set[str]]:
    """Return set of allowed UserIDs based on all active filters, or None if no filters active."""
    has_user_filter = any(_normalize_value(v) for v in (territory, country, customer_status))
    seg = _normalize_value(current_segment)

    if not has_user_filter and not seg:
        return None

    allowed: Optional[set[str]] = None

    if has_user_filter:
        users = _apply_user_filters(_load_users_for_filters(), territory, country, customer_status)
        allowed = set(users["userid"].astype(str).dropna()) if "userid" in users.columns else set()

    if seg:
        rfm = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
        if not rfm.empty and "segment" in rfm.columns and "userid" in rfm.columns:
            seg_ids = set(
                rfm[rfm["segment"].astype(str) == seg]["userid"].astype(str).dropna()
            )
        else:
            seg_ids = set()
        allowed = seg_ids if allowed is None else allowed & seg_ids

    return allowed


def _aggregate_betslips_for_users(
    start: date,
    end: date,
    allowed_ids: set[str],
) -> dict:
    """Aggregate sportsbook betslip metrics filtered to a set of UserIDs."""
    df = load_betslips_raw()
    if df.empty:
        return {"stake": 0.0, "winnings": 0.0, "ggr": 0.0, "betslips": 0}
    df, bcol = normalize_cols(df)
    placement_col = bcol.get("placementdate") or bcol.get("placedate") or bcol.get("betdate") or bcol.get("date")
    stake_col = bcol.get("stake")
    winnings_col = bcol.get("winnings") or bcol.get("userwinnings")
    user_id_col = bcol.get("userid")
    if not placement_col or not user_id_col:
        return {"stake": 0.0, "winnings": 0.0, "ggr": 0.0, "betslips": 0}
    df["_date"] = to_dt(df[placement_col]).dt.date
    df = _filter_range(df, start, end)
    df = df[df[user_id_col].astype(str).isin(allowed_ids)]
    if df.empty:
        return {"stake": 0.0, "winnings": 0.0, "ggr": 0.0, "betslips": 0}
    stake = float(df[stake_col].sum()) if stake_col and stake_col in df.columns else 0.0
    winnings = float(df[winnings_col].sum()) if winnings_col and winnings_col in df.columns else 0.0
    return {"stake": stake, "winnings": winnings, "ggr": stake - winnings, "betslips": len(df)}


def _filtered_registration_counts(
    start: date,
    end: date,
    territory: Optional[str] = None,
    country: Optional[str] = None,
    customer_status: Optional[str] = None,
    current_segment: Optional[str] = None,
) -> dict[date, int]:
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
    users = _load_users_for_filters()
    if allowed_ids is not None:
        if "userid" not in users.columns:
            return {}
        users = users[users["userid"].astype(str).isin(allowed_ids)]
    if users.empty or "creationdate" not in users.columns:
        return {}
    users = users.copy()
    users["creationdate"] = to_dt(users["creationdate"]).dt.date
    users = users[(users["creationdate"] >= max(start, DATA_START_DATE)) & (users["creationdate"] <= end)]
    if users.empty:
        return {}
    counts = users.groupby("creationdate").size()
    return {d: int(v) for d, v in counts.items()}


def _filtered_registration_total(
    start: date,
    end: date,
    territory: Optional[str] = None,
    country: Optional[str] = None,
    customer_status: Optional[str] = None,
    current_segment: Optional[str] = None,
) -> int:
    counts = _filtered_registration_counts(start, end, territory, country, customer_status, current_segment)
    return int(sum(counts.values()))


def _load_latest_users() -> pd.DataFrame:
    if not USERS_RAW.exists():
        return pd.DataFrame()
    full_file = USERS_RAW / "users_full.parquet"
    inc_files = sorted(USERS_RAW.glob("users_increment_*.parquet"))
    if full_file.exists() and inc_files:
        users = pd.concat([pd.read_parquet(full_file)] + [pd.read_parquet(f) for f in inc_files], ignore_index=True)
    elif full_file.exists():
        users = pd.read_parquet(full_file)
    else:
        users = read_all_parquets(USERS_RAW, "users_increment_*.parquet")
    if users.empty:
        return users

    df, mapping = normalize_cols(users)
    uid_col = mapping.get("userid")
    if not uid_col:
        return df

    sort_candidate = None
    for candidate in ("dateversion", "detaildateversion", "creationdate", "lastlogin"):
        if candidate in mapping:
            sort_candidate = mapping[candidate]
            break

    if sort_candidate:
        df["_sort_dt"] = to_dt(df[sort_candidate])
        df = df.sort_values("_sort_dt")

    df = df.drop_duplicates(subset=[uid_col], keep="last")
    return df


def _status_counts() -> list[dict[str, object]]:
    users = _load_latest_users()
    if users.empty:
        return []

    users, mapping = normalize_cols(users)
    status_col = mapping.get("userstatus")
    if not status_col:
        return []

    statuses = users[status_col].fillna("Unknown").astype(str).str.strip()
    statuses.loc[statuses == ""] = "Unknown"
    counts = statuses.value_counts()
    return [
        {"status": str(status), "count": int(count)}
        for status, count in counts.items()
    ]


def _build_conversion_cohorts() -> tuple[pd.DataFrame, Optional[date]]:
    users_dir = _RAW / "users"
    ftd_dir = _RAW / "first_deposits"
    def _raw_files(directory: Path, increment_glob: str, full_glob: str) -> list:
        if not directory.exists():
            return []
        full = sorted(directory.glob(full_glob))
        incs = sorted(directory.glob(increment_glob))
        return full + incs  # full first (historical), then any new increments

    user_files = _raw_files(users_dir, "users_increment_*.parquet", "users_full.parquet")
    ftd_files = _raw_files(ftd_dir, "first_deposits_increment_*.parquet", "first_deposits_full.parquet")
    if not user_files or not ftd_files:
        empty = pd.DataFrame(
            columns=["date", "registrations", "ftds_d7", "ftds_d30", "rate_d7", "rate_d30"]
        )
        return empty, None

    fingerprint = ("cohorts", _raw_files_fingerprint(user_files), _raw_files_fingerprint(ftd_files))
    if _COHORT_CACHE.get("fingerprint") == fingerprint:
        cached_df = _COHORT_CACHE.get("df")
        if isinstance(cached_df, pd.DataFrame):
            return cached_df.copy(), _COHORT_CACHE.get("max_observed_date")

    users = pd.concat((pd.read_parquet(f) for f in user_files), ignore_index=True)
    first_deposits = pd.concat((pd.read_parquet(f) for f in ftd_files), ignore_index=True)
    users, ucol = _normalize_cols(users)
    first_deposits, fcol = _normalize_cols(first_deposits)

    uid_col = ucol.get("userid")
    creation_col = ucol.get("creationdate")
    if not uid_col or not creation_col:
        empty = pd.DataFrame(
            columns=["date", "registrations", "ftds_d7", "ftds_d30", "rate_d7", "rate_d30"]
        )
        return empty, None

    users["_uid"] = pd.to_numeric(users[uid_col], errors="coerce")
    users["_creation_dt"] = pd.to_datetime(users[creation_col], errors="coerce")
    users = users.dropna(subset=["_uid", "_creation_dt"]).copy()

    test_col = ucol.get("testuser")
    if test_col:
        users = users[pd.to_numeric(users[test_col], errors="coerce").fillna(0).astype(int) == 0].copy()

    users = users.sort_values("_creation_dt").drop_duplicates(subset=["_uid"], keep="first")
    users["date"] = users["_creation_dt"].dt.date

    ftd_uid_col = fcol.get("idutente")
    ftd_date_col = fcol.get("dataprimodeposito")
    if not ftd_uid_col or not ftd_date_col:
        daily_regs = (
            users.groupby("date")["_uid"].nunique().rename("registrations").reset_index().sort_values("date")
        )
        daily_regs["ftds_d7"] = 0
        daily_regs["ftds_d30"] = 0
        daily_regs["rate_d7"] = 0.0
        daily_regs["rate_d30"] = 0.0
        return daily_regs, None

    first_deposits["_uid"] = pd.to_numeric(first_deposits[ftd_uid_col], errors="coerce")
    first_deposits["_ftd_dt"] = pd.to_datetime(first_deposits[ftd_date_col], errors="coerce")
    first_deposits = first_deposits.dropna(subset=["_uid", "_ftd_dt"]).copy()
    first_deposits = first_deposits.sort_values("_ftd_dt").drop_duplicates(subset=["_uid"], keep="first")
    max_observed_date = first_deposits["_ftd_dt"].dt.date.max()

    merged = users[["_uid", "date"]].merge(first_deposits[["_uid", "_ftd_dt"]], on="_uid", how="left")
    merged["_cohort_dt"] = pd.to_datetime(merged["date"], errors="coerce")
    merged["lag_days"] = (merged["_ftd_dt"].dt.normalize() - merged["_cohort_dt"]).dt.days
    merged.loc[merged["lag_days"] < 0, "lag_days"] = pd.NA

    regs = merged.groupby("date")["_uid"].nunique().rename("registrations").reset_index()
    d7 = (
        merged[(merged["lag_days"] >= 0) & (merged["lag_days"] <= 7)]
        .groupby("date")["_uid"]
        .nunique()
        .rename("ftds_d7")
        .reset_index()
    )
    d30 = (
        merged[(merged["lag_days"] >= 0) & (merged["lag_days"] <= 30)]
        .groupby("date")["_uid"]
        .nunique()
        .rename("ftds_d30")
        .reset_index()
    )

    out = regs.merge(d7, on="date", how="left").merge(d30, on="date", how="left").fillna(0)
    out["registrations"] = out["registrations"].astype(int)
    out["ftds_d7"] = out["ftds_d7"].astype(int)
    out["ftds_d30"] = out["ftds_d30"].astype(int)

    out["rate_d7"] = np.where(
        out["registrations"] > 0,
        out["ftds_d7"].astype(float) / out["registrations"].astype(float) * 100.0,
        0.0,
    )
    out["rate_d30"] = np.where(
        out["registrations"] > 0,
        out["ftds_d30"].astype(float) / out["registrations"].astype(float) * 100.0,
        0.0,
    )

    if max_observed_date:
        observed_dt = pd.Timestamp(max_observed_date)
        cohort_dt = pd.to_datetime(out["date"], errors="coerce")
        mature_d7 = cohort_dt + pd.Timedelta(days=7) <= observed_dt
        mature_d30 = cohort_dt + pd.Timedelta(days=30) <= observed_dt
        out.loc[~mature_d7, "rate_d7"] = pd.NA
        out.loc[~mature_d30, "rate_d30"] = pd.NA

    out = out.sort_values("date")

    _COHORT_CACHE["fingerprint"] = fingerprint
    _COHORT_CACHE["df"] = out.copy()
    _COHORT_CACHE["max_observed_date"] = max_observed_date
    return out, max_observed_date


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Playa Bets Analytics API", version="0.3")


@app.middleware("http")
async def _log_requests(request: Request, call_next):
    import time
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
    allow_methods=["GET", "OPTIONS"],  # Read-only API
    allow_headers=["Content-Type", "Authorization", "Accept", "X-API-Key"],
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


def _filter_range(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    if df.empty or "date" not in df.columns:
        return df
    effective_start = max(start, DATA_START_DATE)
    return df[(df["date"] >= effective_start) & (df["date"] <= end)]


def _s(df: pd.DataFrame, col: str) -> float:
    return float(df[col].sum()) if col in df.columns else 0.0


def _i(df: pd.DataFrame, col: str) -> int:
    return int(df[col].sum()) if col in df.columns else 0


def _mean_i(df: pd.DataFrame, col: str) -> int:
    """Return rounded mean of a column — used for avg daily unique users."""
    return int(round(df[col].mean())) if col in df.columns and len(df) > 0 else 0


def _load_transactions_df(start: date, end: date) -> pd.DataFrame:
    if not ENABLE_TRANSACTIONS:
        return pd.DataFrame()
    return _filter_range(load_parquet_cached(TX_DAILY_PATH, "tx_daily"), start, end)


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
# Overview KPIs
# ---------------------------------------------------------------------------
@app.get("/kpis")
def kpis(
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)

    df = _filter_range(load_daily_df(), start, end)
    tx = _load_transactions_df(start, end)
    bonus = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)
    ftd = _filter_range(load_parquet_cached(FTD_DAILY_PATH, "ftd_daily"), start, end)
    casino = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)

    # When user/segment filter active, re-aggregate sportsbook metrics from raw betslips
    if allowed_ids is not None:
        bs = _aggregate_betslips_for_users(start, end, allowed_ids)
        sportsbook_turnover = bs["stake"]
        sportsbook_winnings = bs["winnings"]
        sportsbook_ggr = bs["ggr"]
        sportsbook_actives = 0  # cannot derive actives from betslip filter alone
    else:
        sportsbook_turnover = _s(df, "settled_stake") or _s(df, "placed_stake")
        sportsbook_winnings = _s(df, "settled_winnings")
        sportsbook_ggr = _s(df, "ggr")
        sportsbook_actives = _mean_i(df, "actives_sports")

    # Horse racing (Betmakers) is separated from casino — add to sports totals.
    horse_racing_ggr   = _s(casino, "horse_racing_ggr")
    horse_racing_stake = _s(casino, "horse_racing_stake")
    sportsbook_ggr     += horse_racing_ggr
    sportsbook_turnover += horse_racing_stake

    casino_turnover = _s(casino, "casino_stake")
    casino_winnings = _s(casino, "casino_winnings")
    casino_ggr = _s(casino, "casino_ggr")

    # Period-unique actives from actives_monthly.parquet (falls back to daily avg).
    actives_monthly = load_parquet_cached(ACTIVES_MONTHLY_PATH, "actives_monthly")
    if not actives_monthly.empty and "month" in actives_monthly.columns:
        start_month = start.strftime("%Y-%m")
        end_month = end.strftime("%Y-%m")
        mask = (actives_monthly["month"] >= start_month) & (actives_monthly["month"] <= end_month)
        am = actives_monthly[mask]
        sportsbook_actives = int(am["sports_actives_unique"].sum()) if "sports_actives_unique" in am.columns and not am.empty else sportsbook_actives
        casino_actives = int(am["casino_actives_unique"].sum()) if "casino_actives_unique" in am.columns and not am.empty else _mean_i(casino, "casino_actives")
    else:
        casino_actives = _mean_i(casino, "casino_actives")

    turnover = sportsbook_turnover + casino_turnover
    winnings = sportsbook_winnings + casino_winnings
    ggr = sportsbook_ggr + casino_ggr
    # bonus_total = net credited bonuses (reversals excluded) + all freebets issued
    # Falls back to bonus_credited if bonus_total not yet in serving file.
    bonus_spent = _s(bonus, "bonus_total") or _s(bonus, "bonus_credited")
    freebet_issued = _s(bonus, "freebet_issued")
    freebet_spend  = _s(bonus, "freebet_spend")   # used freebets — reference
    ngr = ggr - bonus_spent

    # FTD Reg Month: users who registered in period AND have ever deposited (lifetime).
    ftd_reg_month_df = _filter_range(load_parquet_cached(FTD_REG_MONTH_DAILY_PATH, "ftd_reg_month_daily"), start, end)
    ftd_reg_month = _i(ftd_reg_month_df, "ftd_reg_month")

    filtered_registrations = _filtered_registration_total(start, end, territory, country, customer_status, current_segment) if allowed_ids is not None else None

    return {
        "range": {"start": str(start), "end": str(end)},
        "registrations": filtered_registrations if filtered_registrations is not None else _i(df, "registrations"),
        "actives": sportsbook_actives + casino_actives,
        "sports_actives": sportsbook_actives,
        "casino_actives": casino_actives,
        "turnover": turnover,
        "winnings": winnings,
        "ggr": ggr,
        "ngr": ngr,
        "bonus_spent": bonus_spent,
        "freebet_spend": freebet_spend,
        "sportsbook_turnover": sportsbook_turnover,
        "sportsbook_winnings": sportsbook_winnings,
        "sportsbook_ggr": sportsbook_ggr,
        "casino_turnover": casino_turnover,
        "casino_winnings": casino_winnings,
        "casino_ggr": casino_ggr,
        "ftds": _i(ftd, "ftds"),
        "ftd_reg_month": ftd_reg_month,
        "deposits": _s(tx, "deposits"),
        "withdrawals": _s(tx, "withdrawals"),
        "net_deposits": _s(tx, "net_deposits"),
        "bonus_spent": bonus_spent,
        "bonus_redeemed": _s(tx, "bonus_redeemed"),
        "bonus_issued_tx": _s(tx, "bonus_issued"),
        "bonus_net": _s(tx, "bonus_net"),
        "unique_depositors": _i(tx, "unique_depositors"),
        "has_transactions_data": ENABLE_TRANSACTIONS and not tx.empty,
        "transactions_enabled": ENABLE_TRANSACTIONS,
        "filters_applied": {
            "territory": bool(_normalize_value(territory)),
            "country": bool(_normalize_value(country)),
            "customer_status": bool(_normalize_value(customer_status)),
            "current_segment": bool(_normalize_value(current_segment)),
            "registrations_filtered": filtered_registrations is not None,
        },
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
            {"date": str(dt), "value": float(v) if pd.notna(v) else None}
            for dt, v in zip(d["date"], d[metric])
        ],
    }


@app.get("/timeseries/registrations")
def registrations_timeseries(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
    if allowed_ids is not None:
        counts = _filtered_registration_counts(start, end, territory, country, customer_status, current_segment)
        dates = pd.date_range(start, end, freq="D").date
        regs = [{"date": str(d), "value": int(counts.get(d, 0))} for d in dates]
        ftds = [{"date": str(d), "value": 0} for d in dates]
        return {"registrations": regs, "ftds": ftds, "filters_applied": True}

    df = load_daily_df()
    ftd = load_parquet_cached(FTD_DAILY_PATH, "ftd_daily")
    d = _filter_range(df, start, end).sort_values("date")
    f = _filter_range(ftd, start, end).sort_values("date")

    ftd_by_date: dict[date, int] = {}
    if not f.empty and "date" in f.columns and "ftds" in f.columns:
        ftd_by_date = dict(zip(f["date"], f["ftds"].fillna(0).astype(int)))

    regs = [{"date": str(x), "value": int(v)} for x, v in zip(d["date"], d.get("registrations", [0] * len(d)))]
    ftds = [{"date": str(x), "value": int(ftd_by_date.get(x, 0))} for x in d["date"]]
    return {"registrations": regs, "ftds": ftds, "filters_applied": False}


@app.get("/timeseries/conversion-cohorts")
def conversion_cohorts_timeseries(
    start: date = Query(...),
    end: date = Query(...),
):
    cohorts, max_observed_date = _build_conversion_cohorts()
    if cohorts.empty:
        return {"points": [], "max_observed_date": None}

    d = cohorts[(cohorts["date"] >= start) & (cohorts["date"] <= end)].sort_values("date")
    records = d.to_dict("records")
    return {
        "max_observed_date": str(max_observed_date) if max_observed_date else None,
        "points": [
            {
                "date": str(r["date"]),
                "registrations": int(r.get("registrations", 0) or 0),
                "ftds_d7": int(r.get("ftds_d7", 0) or 0),
                "ftds_d30": int(r.get("ftds_d30", 0) or 0),
                "rate_d7": (float(r["rate_d7"]) if pd.notna(r.get("rate_d7")) else None),
                "rate_d30": (float(r["rate_d30"]) if pd.notna(r.get("rate_d30")) else None),
            }
            for r in records
        ],
    }


# ---------------------------------------------------------------------------
# KPI series / rolling / latest (legacy endpoints kept for compatibility)
# ---------------------------------------------------------------------------
_SAST = timezone(timedelta(hours=2))

@app.get("/kpis/latest")
def kpis_latest():
    df = load_daily_df()
    if df.empty:
        raise HTTPException(404, "KPI table is empty")
    row = df.iloc[-1].to_dict()
    result = {k: (str(v) if k == "date" else (v.item() if hasattr(v, "item") else v)) for k, v in row.items()}
    if DATA_PATH.exists():
        mtime = DATA_PATH.stat().st_mtime
        sast_dt = datetime.fromtimestamp(mtime, tz=_SAST)
        result["last_updated"] = sast_dt.strftime("%Y-%m-%d %H:%M SAST")
    return result


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
            {"date": str(dt), "value": float(v) if pd.notna(v) else None}
            for dt, v in zip(tail_df["date"], tail_df[metric])
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
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    df = load_daily_df()
    if df.empty:
        return {"path": str(DATA_PATH), "rows": []}
    d = df.copy()
    if start and end and "date" in d.columns:
        d = _filter_range(d, start, end)
        allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
        if allowed_ids is not None:
            regs_by_date = _filtered_registration_counts(start, end, territory, country, customer_status, current_segment)
            d["registrations"] = d["date"].map(lambda x: int(regs_by_date.get(x, 0)))
    d = d.sort_values("date")
    if metrics:
        wanted = [c.strip() for c in metrics.split(",") if c.strip()]
        keep = ["date"] + [c for c in wanted if c in d.columns and c != "date"]
        if keep:
            d = d[keep]
    return {"path": str(DATA_PATH), "rows": d.to_dict(orient="records")}


@app.get("/users/status-breakdown")
def users_status_breakdown(
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    users = _apply_user_filters(_load_users_for_filters(), territory, country, customer_status)
    seg = _normalize_value(current_segment)
    if seg and not users.empty and "userid" in users.columns:
        rfm = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
        if not rfm.empty and "segment" in rfm.columns and "userid" in rfm.columns:
            seg_ids = set(rfm[rfm["segment"].astype(str) == seg]["userid"].astype(str).dropna())
            users = users[users["userid"].astype(str).isin(seg_ids)]
    if users.empty or "userstatus" not in users.columns:
        return {"statuses": []}
    statuses = users["userstatus"].fillna("Unknown").astype(str).str.strip()
    statuses.loc[statuses == ""] = "Unknown"
    counts = statuses.value_counts()
    return {
        "statuses": [{"status": str(status), "count": int(count)} for status, count in counts.items()],
        "filters_applied": {
            "territory": bool(_normalize_value(territory)),
            "country": bool(_normalize_value(country)),
            "customer_status": bool(_normalize_value(customer_status)),
            "current_segment": bool(seg),
        },
    }


@app.get("/users/self-exclusions")
def users_self_exclusions():
    if not SELFEXCLUSIONS_PATH.exists():
        return {"total": 0, "inProgress": 0, "pending": 0, "completed": 0, "byPeriod": [], "has_data": False}

    df = load_parquet_cached(SELFEXCLUSIONS_PATH, "selfexclusions")
    if df.empty:
        return {"total": 0, "inProgress": 0, "pending": 0, "completed": 0, "byPeriod": [], "has_data": False}

    df, _ = normalize_cols(df)

    status_col = next((c for c in df.columns if c == "selfexclusionstatus"), None)
    period_col = next((c for c in df.columns if c == "selfexclusionperiod"), None)

    total = len(df)
    in_progress = 0
    pending = 0
    completed = 0
    if status_col:
        statuses = df[status_col].fillna("").astype(str).str.strip().str.lower()
        in_progress = int((statuses == "in progress").sum())
        pending = int((statuses == "pending").sum())
        completed = int((statuses == "completed").sum())

    by_period: list[dict] = []
    if period_col:
        counts = df[period_col].fillna("Unknown").astype(str).str.strip().value_counts()
        by_period = [{"period": str(p), "count": int(c)} for p, c in counts.items()]

    return {
        "total": total,
        "inProgress": in_progress,
        "pending": pending,
        "completed": completed,
        "byPeriod": by_period,
        "has_data": True,
    }


@app.get("/users/self-exclusions/trend")
def users_self_exclusions_trend(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    """Return monthly self-exclusion trend: how many started/active/completed per month."""
    if not SELFEXCLUSIONS_PATH.exists():
        return {"points": []}

    df = load_parquet_cached(SELFEXCLUSIONS_PATH, "selfexclusions")
    if df.empty:
        return {"points": []}

    df, _ = normalize_cols(df)

    # Try common date column names for exclusion start date
    date_col = next(
        (c for c in df.columns if c in ("startdate", "selfexclusiondate", "creationdate", "insertdate", "startdt")),
        None,
    )
    status_col = next((c for c in df.columns if c == "selfexclusionstatus"), None)

    if not date_col:
        return {"points": []}

    df["_dt"] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=["_dt"])
    df["_month"] = df["_dt"].dt.to_period("M").dt.to_timestamp()

    if start:
        df = df[df["_dt"].dt.date >= start]
    if end:
        df = df[df["_dt"].dt.date <= end]

    if df.empty:
        return {"points": []}

    if status_col:
        statuses = df[status_col].fillna("").astype(str).str.strip().str.lower()
        df["_status_norm"] = statuses
        monthly = df.groupby("_month").apply(
            lambda g: pd.Series({
                "started": len(g),
                "completed": int((g["_status_norm"] == "completed").sum()),
                "active": int((g["_status_norm"] == "in progress").sum()),
            })
        ).reset_index()
    else:
        monthly = df.groupby("_month").size().reset_index(name="started")
        monthly["completed"] = 0
        monthly["active"] = 0

    points = [
        {
            "date": str(r["_month"].date()),
            "started": int(r.get("started", 0)),
            "active": int(r.get("active", 0)),
            "completed": int(r.get("completed", 0)),
        }
        for _, r in monthly.iterrows()
    ]
    points.sort(key=lambda x: x["date"])
    return {"points": points}


def _summary_period(start: date, end: date) -> dict:
    """Aggregate all summary-table metrics for a given date range."""
    df = _filter_range(load_daily_df(), start, end)
    casino = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)
    ftd = _filter_range(load_parquet_cached(FTD_DAILY_PATH, "ftd_daily"), start, end)
    bonus = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)

    regs = _i(df, "registrations")
    ftds = _i(ftd, "ftds")

    # FTD Reg Month: users who registered in the period AND have ever deposited (lifetime).
    ftd_reg_month_df = _filter_range(load_parquet_cached(FTD_REG_MONTH_DAILY_PATH, "ftd_reg_month_daily"), start, end)
    ftd_reg_month = _i(ftd_reg_month_df, "ftd_reg_month")

    # Conv rate = FTD Reg Month ÷ Registrations (users who registered AND ever deposited).
    conv_rate = round(ftd_reg_month / regs * 100, 1) if regs > 0 else 0.0

    sports_turnover = _s(df, "placed_stake")
    sports_winnings = _s(df, "settled_winnings")
    sports_ggr = _s(df, "ggr")
    sports_bets = _i(df, "betslips_count")
    sports_settled = _i(df, "betslips_settled_count")
    avg_stake = round(sports_turnover / sports_bets, 2) if sports_bets > 0 else 0.0
    win_rate = round(_s(df, "win_rate"), 1) if "win_rate" in df.columns and len(df) > 0 else 0.0
    cancel_rate = round(_s(df, "cancel_rate"), 1) if "cancel_rate" in df.columns and len(df) > 0 else 0.0

    # Horse racing (Betmakers) is separated from casino in casino_daily.parquet.
    # Add it to sports totals so casino figures reflect pure casino only.
    horse_racing_ggr     = _s(casino, "horse_racing_ggr")
    horse_racing_stake   = _s(casino, "horse_racing_stake")
    sports_ggr          += horse_racing_ggr
    sports_turnover     += horse_racing_stake
    sports_hold = round(sports_ggr / sports_turnover * 100, 1) if sports_turnover > 0 else 0.0

    casino_stake = _s(casino, "casino_stake")
    casino_winnings = _s(casino, "casino_winnings")
    casino_ggr = _s(casino, "casino_ggr")
    casino_bets = _i(casino, "casino_bets")
    casino_margin = round(casino_ggr / casino_stake * 100, 1) if casino_stake > 0 else 0.0
    casino_rtp = round(100.0 - casino_margin, 1)

    total_ggr = sports_ggr + casino_ggr
    bonus_spent = _s(bonus, "bonus_total") or _s(bonus, "bonus_credited")
    freebet_issued = _s(bonus, "freebet_issued")
    freebet_spend  = _s(bonus, "freebet_spend")
    ngr = total_ggr - bonus_spent
    total_turnover = sports_turnover + casino_stake
    hold_pct = round(total_ggr / total_turnover * 100, 1) if total_turnover > 0 else 0.0

    # Actives: period-total unique users from actives_monthly.parquet.
    # Approximation: sum monthly uniques for months overlapping the date range.
    # (Slight overcount for multi-month periods where users are active in multiple months.)
    actives_monthly = load_parquet_cached(ACTIVES_MONTHLY_PATH, "actives_monthly")
    actives_sports = 0
    actives_casino = 0
    if not actives_monthly.empty and "month" in actives_monthly.columns:
        start_month = start.strftime("%Y-%m")
        end_month = end.strftime("%Y-%m")
        mask = (actives_monthly["month"] >= start_month) & (actives_monthly["month"] <= end_month)
        filtered = actives_monthly[mask]
        if "sports_actives_unique" in filtered.columns:
            actives_sports = int(filtered["sports_actives_unique"].sum())
        if "casino_actives_unique" in filtered.columns:
            actives_casino = int(filtered["casino_actives_unique"].sum())
    # Fall back to daily average if monthly unique not yet available
    if actives_sports == 0:
        actives_sports = _mean_i(df, "actives_sports")
    if actives_casino == 0:
        actives_casino = _mean_i(casino, "casino_actives")

    return {
        "registrations": regs, "ftds": ftds, "ftd_conv_rate": conv_rate,
        "ftd_reg_month": ftd_reg_month,
        "actives_sports": actives_sports, "actives_casino": actives_casino,
        "turnover": round(total_turnover, 2), "ggr": round(total_ggr, 2),
        "ngr": round(ngr, 2), "hold_pct": hold_pct, "bonus_spent": round(bonus_spent, 2), "freebet_spend": round(freebet_spend, 2),
        "sports_bets": sports_bets, "sports_settled": sports_settled,
        "sports_turnover": round(sports_turnover, 2), "sports_winnings": round(sports_winnings, 2),
        "sports_ggr": round(sports_ggr, 2), "sports_hold": sports_hold,
        "win_rate": win_rate, "cancel_rate": cancel_rate, "avg_stake": avg_stake,
        "casino_bets": casino_bets, "casino_stake": round(casino_stake, 2),
        "casino_winnings": round(casino_winnings, 2), "casino_ggr": round(casino_ggr, 2),
        "casino_margin": casino_margin, "casino_rtp": casino_rtp, "casino_actives": actives_casino,
    }


@app.get("/kpis/summary")
def kpis_summary(
    start: date = Query(...),
    end: date = Query(...),
    previous_start: Optional[date] = Query(None),
    previous_end: Optional[date] = Query(None),
    ytd_start: Optional[date] = Query(None),
):
    # Auto-compute previous period (same duration shifted back) if not provided
    if previous_start is None or previous_end is None:
        duration = (end - start).days
        previous_end = start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=duration)

    # Auto-compute YTD (Jan 1 of end year → end) if not provided
    if ytd_start is None:
        ytd_start = date(end.year, 1, 1)

    current = _summary_period(start, end)
    previous = _summary_period(previous_start, previous_end)
    ytd = _summary_period(ytd_start, end)

    # RFM snapshot (latest)
    rfm_df = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    rfm = {"vip": 0, "active": 0, "new": 0, "cooling": 0, "lapsed": 0, "dormant": 0}
    if not rfm_df.empty and "segment" in rfm_df.columns:
        counts = rfm_df["segment"].fillna("Unknown").value_counts().to_dict()
        rfm = {
            "vip": int(counts.get("VIP", 0)),
            "active": int(counts.get("Active", 0)),
            "new": int(counts.get("New", 0)),
            "cooling": int(counts.get("Cooling", 0)),
            "lapsed": int(counts.get("Lapsed", 0)),
            "dormant": int(counts.get("Dormant", 0)),
        }

    self_ex_total = 0
    if SELFEXCLUSIONS_PATH.exists():
        ex_df = load_parquet_cached(SELFEXCLUSIONS_PATH, "selfexclusions")
        self_ex_total = len(ex_df)

    return {
        "current": current,
        "previous": previous,
        "ytd": ytd,
        "rfm": rfm,
        "self_exclusions": self_ex_total,
        "periods": {
            "current": {"start": str(start), "end": str(end)},
            "previous": {"start": str(previous_start), "end": str(previous_end)},
            "ytd": {"start": str(ytd_start), "end": str(end)},
        },
    }


# ---------------------------------------------------------------------------
# FTD daily
# ---------------------------------------------------------------------------
@app.get("/ftd/daily")
def ftd_daily(
    start: date = Query(...),
    end: date = Query(...),
):
    ftd = _filter_range(load_parquet_cached(FTD_DAILY_PATH, "ftd_daily"), start, end)
    if ftd.empty:
        return {"points": []}
    ftd = ftd.sort_values("date")
    return {
        "points": [
            {"date": str(r["date"]), "ftds": int(r.get("ftds", 0) or 0)}
            for r in ftd.to_dict("records")
        ]
    }


@app.get("/ftd-reg-month/daily")
def ftd_reg_month_daily(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(FTD_REG_MONTH_DAILY_PATH, "ftd_reg_month_daily"), start, end)
    if df.empty:
        return {"points": []}
    df = df.sort_values("date")
    return {
        "points": [
            {"date": str(r["date"]), "ftd_reg_month": int(r.get("ftd_reg_month", 0) or 0)}
            for r in df.to_dict("records")
        ]
    }


# ---------------------------------------------------------------------------
# RFM
# ---------------------------------------------------------------------------
@app.get("/rfm/segments")
def rfm_segments(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
    mode: Optional[str] = Query(None),
):
    rfm_cols = ["date", "rfm_vip", "rfm_active", "rfm_new", "rfm_cooling", "rfm_lapsed", "rfm_dormant"]

    # 1. Monthly snapshots (backfilled history) — highest priority
    if str(mode or "").lower() != "snapshot" and RFM_MONTHLY_PATH.exists():
        monthly = load_parquet_cached(RFM_MONTHLY_PATH, "rfm_monthly")
        if not monthly.empty and all(col in monthly.columns for col in rfm_cols):
            d = monthly[rfm_cols].copy()
            if start and end:
                d = _filter_range(d, start, end)
            rows = d.to_dict(orient="records")
            if rows:
                return {"rows": rows, "source": "rfm_monthly"}

    # 2. Daily KPIs rfm columns (single-day snapshots attached to each run)
    if str(mode or "").lower() != "snapshot":
        daily = load_daily_df()
        if not daily.empty and all(col in daily.columns for col in rfm_cols):
            d = daily[rfm_cols].copy()
            if start and end:
                d = _filter_range(d, start, end)
            rows = d.to_dict(orient="records")
            if rows:
                return {"rows": rows, "source": "daily_kpis"}

    df = load_parquet_cached(RFM_USERS_PATH, "rfm_users")
    if df.empty or "segment" not in df.columns:
        return {"rows": [], "source": "rfm_users"}

    counts = df["segment"].fillna("Unknown").astype(str).str.strip()
    counts.loc[counts == ""] = "Unknown"
    grouped = counts.value_counts().to_dict()
    daily = load_daily_df()
    snapshot_date = str(end or start or (daily["date"].max() if not daily.empty else date.today()))
    return {
        "rows": [{
            "date": snapshot_date,
            "rfm_vip": int(grouped.get("VIP", 0)),
            "rfm_active": int(grouped.get("Active", 0)),
            "rfm_new": int(grouped.get("New", 0)),
            "rfm_cooling": int(grouped.get("Cooling", 0)),
            "rfm_lapsed": int(grouped.get("Lapsed", 0)),
            "rfm_dormant": int(grouped.get("Dormant", 0)),
        }],
        "source": "rfm_users",
    }


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
    users = d.head(limit).to_dict(orient="records")
    for row in users:
        if "segment" in row and "rfm_segment" not in row:
            row["rfm_segment"] = row["segment"]
        if "frequency_30d" in row and "frequency" not in row:
            row["frequency"] = row["frequency_30d"]
        if "monetary_30d" in row and "monetary" not in row:
            row["monetary"] = row["monetary_30d"]
    return {"users": users}


# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Betting
# ---------------------------------------------------------------------------
@app.get("/sportsbook/kpis")
def sportsbook_kpis(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    df = _filter_range(load_parquet_cached(DAILY_KPIS_PATH, "daily_kpis"), start, end)
    if df.empty:
        return {"settled_stake": 0, "winnings": 0, "ggr": 0, "betslips": 0}
    allowed_ids = _get_allowed_user_ids(territory, country, None, current_segment)
    if allowed_ids is not None:
        bs = _aggregate_betslips_for_users(start, end, allowed_ids)
        return {
            "settled_stake": round(bs["stake"], 2),
            "winnings": round(bs["winnings"], 2),
            "ggr": round(bs["ggr"], 2),
            "betslips": bs["betslips"],
        }
    stake = _s(df, "placed_stake") or _s(df, "settled_stake")
    winnings = _s(df, "settled_winnings")
    ggr = _s(df, "ggr")
    betslips = _i(df, "betslips_count")
    return {
        "settled_stake": round(stake, 2),
        "winnings": round(winnings, 2),
        "ggr": round(ggr, 2),
        "betslips": betslips,
    }


@app.get("/betting/betslips-by-status")
def betslips_by_status(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    df = load_betslips_raw()
    if df.empty:
        return []
    df, bcol = normalize_cols(df)
    status_col = bcol.get("betslipstatus") or bcol.get("status") or bcol.get("betslipstatusid") or bcol.get("statusid")
    status_id_col = bcol.get("betslipstatusid") or bcol.get("statusid")
    placement_col = bcol.get("placementdate") or bcol.get("placedate") or bcol.get("betdate") or bcol.get("date")
    user_id_col = bcol.get("userid")
    if not status_col or not placement_col:
        return []
    df["_date"] = to_dt(df[placement_col]).dt.date
    df = _filter_range(df, start, end)
    if df.empty:
        return []
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
    if allowed_ids is not None and user_id_col:
        df = df[df[user_id_col].astype(str).isin(allowed_ids)]
        if df.empty:
            return []
    grouped = df.groupby(status_col).size().reset_index(name="count")
    if status_id_col and status_id_col in df.columns and status_id_col != status_col:
        id_map = df[[status_col, status_id_col]].dropna().drop_duplicates()
        grouped = grouped.merge(id_map, on=status_col, how="left")
    rows = []
    for _, r in grouped.iterrows():
        status_val = r[status_col]
        status = str(status_val) if pd.notna(status_val) else "Unknown"
        status_id = None
        if status_id_col and status_id_col in r.index:
            try:
                status_id = int(r[status_id_col]) if pd.notna(r[status_id_col]) else None
            except Exception:
                status_id = None
        rows.append({"status": status, "statusId": status_id, "count": int(r["count"])})
    return rows

@app.get("/betting/betslips-by-type")
def betslips_by_type(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
    current_segment: Optional[str] = Query(None),
):
    df = load_betslips_raw()
    if df.empty:
        return []
    df, bcol = normalize_cols(df)
    type_col = bcol.get("betsliptype") or bcol.get("betsliptypeid") or bcol.get("bettype") or bcol.get("bettypeid") or bcol.get("type")
    type_id_col = bcol.get("betsliptypeid") or bcol.get("bettypeid")
    placement_col = bcol.get("placementdate") or bcol.get("placedate") or bcol.get("betdate") or bcol.get("date")
    user_id_col = bcol.get("userid")
    if not type_col or not placement_col:
        return []
    df["_date"] = to_dt(df[placement_col]).dt.date
    df = _filter_range(df, start, end)
    if df.empty:
        return []
    allowed_ids = _get_allowed_user_ids(territory, country, customer_status, current_segment)
    if allowed_ids is not None and user_id_col:
        df = df[df[user_id_col].astype(str).isin(allowed_ids)]
        if df.empty:
            return []
    grouped = df.groupby(type_col).size().reset_index(name="count")
    if type_id_col and type_id_col in df.columns and type_id_col != type_col:
        id_map = df[[type_col, type_id_col]].dropna().drop_duplicates()
        grouped = grouped.merge(id_map, on=type_col, how="left")
    rows = []
    for _, r in grouped.iterrows():
        type_val = r[type_col]
        type_name = str(type_val) if pd.notna(type_val) else "Unknown"
        type_id = None
        if type_id_col and type_id_col in r.index:
            try:
                type_id = int(r[type_id_col]) if pd.notna(r[type_id_col]) else None
            except Exception:
                type_id = None
        rows.append({"type": type_name, "typeId": type_id, "count": int(r["count"])})
    return rows

# Transactions
# ---------------------------------------------------------------------------
@app.get("/transactions/kpis")
def transactions_kpis(
    start: date = Query(...),
    end: date = Query(...),
):
    if not ENABLE_TRANSACTIONS:
        return {
            "range": {"start": str(start), "end": str(end)},
            "has_data": False,
            "disabled": True,
            "message": "Transactions are temporarily disabled while the source export is unavailable.",
            "deposits": 0.0,
            "withdrawals": 0.0,
            "net_deposits": 0.0,
            "tx_count": 0,
            "unique_depositors": 0,
            "tx_count_accepted": 0,
            "tx_count_pending": 0,
            "tx_count_system": 0,
            "tx_count_other_status": 0,
        }
    df = _load_transactions_df(start, end)
    return {
        "range": {"start": str(start), "end": str(end)},
        "has_data": not df.empty,
        "disabled": False,
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
    if not ENABLE_TRANSACTIONS:
        return {
            "has_data": False,
            "disabled": True,
            "message": "Transactions are temporarily disabled while the source export is unavailable.",
            "deposits": [],
            "withdrawals": [],
        }
    df = _load_transactions_df(start, end)
    if df.empty:
        return {"has_data": False, "disabled": False, "deposits": [], "withdrawals": []}
    df = df.sort_values("date")
    records = df.to_dict("records")
    return {
        "has_data": True,
        "disabled": False,
        "deposits": [{"date": str(r["date"]), "value": float(r.get("deposits", 0) or 0)} for r in records],
        "withdrawals": [{"date": str(r["date"]), "value": float(r.get("withdrawals", 0) or 0)} for r in records],
    }


# ---------------------------------------------------------------------------
# Bonus
# ---------------------------------------------------------------------------
@app.get("/bonus/kpis")
def bonus_kpis(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    df = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)

    if df.empty:
        return {
            "total_bonuses_credited": 0,
            "average_daily_bonus_per_user": 0,
            "est_total_bonuses_per_user": 0,
            "average_daily_unique_bonus_users": 0,
            "bonuses_paid_total_count": 0,
        }

    credited_col = "bonus_credited" if "bonus_credited" in df.columns else None
    count_col = "bonus_count" if "bonus_count" in df.columns else None
    users_col = "unique_bonus_users" if "unique_bonus_users" in df.columns else None

    total_credited = float(df[credited_col].sum()) if credited_col else 0.0
    total_count = int(df[count_col].sum()) if count_col else 0
    avg_daily_users = float(df[users_col].mean()) if users_col else 0.0

    if credited_col and users_col:
        df["_per_user"] = df[credited_col] / df[users_col].clip(lower=1)
        avg_daily_bonus_per_user = float(df["_per_user"].mean())
        est_total_per_user = float(df["_per_user"].sum())
    else:
        avg_daily_bonus_per_user = 0.0
        est_total_per_user = 0.0

    return {
        "total_bonuses_credited": round(total_credited, 2),
        "average_daily_bonus_per_user": round(avg_daily_bonus_per_user, 2),
        "est_total_bonuses_per_user": round(est_total_per_user, 2),
        "average_daily_unique_bonus_users": round(avg_daily_users, 1),
        "bonuses_paid_total_count": total_count,
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
            {
                "date": str(r["date"]),
                "bonus_credited": float(r.get("bonus_credited", 0) or 0),
                "freebet_issued": float(r.get("freebet_issued", 0) or 0),
                "freebet_spend": float(r.get("freebet_spend", 0) or 0),
                "bonus_total": float(r.get("bonus_total", 0) or 0),
                "first_deposit_bonus_count": int(r.get("first_deposit_bonus_count", 0) or 0),
                "first_deposit_bonus_users": int(r.get("first_deposit_bonus_users", 0) or 0),
                "first_deposit_bonus_amount": float(r.get("first_deposit_bonus_amount", 0) or 0),
            }
            for r in df.to_dict("records")
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
    rows = []
    for r in d.to_dict(orient="records"):
        rows.append({
            "campaignId": r.get("CampaignID") or r.get("campaignId") or r.get("campaignid"),
            "name": r.get("Name") or r.get("name") or "Unknown Campaign",
            "status": r.get("CampaignStatus") or r.get("campaignStatus") or r.get("status") or "Unknown",
            "bonusType": r.get("BonusType") or r.get("bonusType") or r.get("bonustype") or "Unknown",
            "startDate": str(r.get("ValidityStartDate") or r.get("startDate") or ""),
            "endDate": str(r.get("ValidityEndDate") or r.get("endDate") or ""),
            "usersEnrolled": None,
            "totalPaid": None,
            "roi": None,
        })
    return {"campaigns": rows}


@app.get("/bonus/freebets")
def bonus_freebets(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    if not FREEBETS_PATH.exists():
        return {"issued": 0, "used": 0, "expired": 0, "pending": 0, "total_amount": 0.0, "has_data": False}
    df = load_parquet_cached(FREEBETS_PATH, "freebets")
    if df.empty:
        return {"issued": 0, "used": 0, "expired": 0, "pending": 0, "total_amount": 0.0, "has_data": False}
    if start or end:
        df = df.copy()
        df["_date"] = to_dt(df["InsertDate"]).dt.date
        if start:
            df = df[df["_date"] >= start]
        if end:
            df = df[df["_date"] <= end]
    if df.empty:
        return {"issued": 0, "used": 0, "expired": 0, "pending": 0, "total_amount": 0.0, "has_data": True}
    total = len(df)
    total_amount = float(df["Amount"].sum()) if "Amount" in df.columns else 0.0
    status_col = "FreeBetStatus" if "FreeBetStatus" in df.columns else None
    if not status_col:
        return {"issued": total, "used": 0, "expired": 0, "pending": total, "total_amount": round(total_amount, 2), "has_data": True}
    s = df[status_col].fillna("").str.lower()
    used = int(s.str.contains("wagered|used|played|won|lost|settled").sum())
    expired = int(s.str.contains("expired|void|cancel").sum())
    pending = int(s.str.contains("active|pending|new|open|issued").sum())
    return {
        "issued": total,
        "used": used,
        "expired": expired,
        "pending": pending,
        "total_amount": round(total_amount, 2),
        "has_data": True,
    }


# ---------------------------------------------------------------------------
# Casino
# ---------------------------------------------------------------------------
@app.get("/casino/kpis")
def casino_kpis(
    start: date = Query(...),
    end: date = Query(...),
):
    df = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)
    stake    = _s(df, "casino_stake")
    winnings = _s(df, "casino_winnings")
    ggr      = _s(df, "casino_ggr")
    tx = _load_transactions_df(start, end)
    depositors = _i(tx, "unique_depositors")
    deposits   = _s(tx, "deposits")
    return {
        "range": {"start": str(start), "end": str(end)},
        "stake":    stake,
        "winnings": winnings,
        "ggr":      ggr,
        "bets":     _i(df, "casino_bets"),
        "actives":  _i(df, "casino_actives"),
        "hold_pct": round(ggr / stake * 100, 2) if stake else 0.0,
        "depositors": depositors,
        "deposit_per_customer": round(deposits / depositors, 2) if depositors > 0 else 0.0,
        "casino_stake":    stake,
        "casino_winnings": winnings,
        "casino_ggr":      ggr,
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
                "stake": float(r.get("casino_stake", 0) or 0),
                "winnings": float(r.get("casino_winnings", 0) or 0),
                "ggr": float(r.get("casino_ggr", 0) or 0),
                "casino_actives": int(r.get("casino_actives", 0) or 0) if pd.notna(r.get("casino_actives")) else 0,
            }
            for r in df.to_dict("records")
        ]
    }


@app.get("/casino/providers")
def casino_providers(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    """Provider breakdown from pre-aggregated casino_providers_daily.parquet."""
    df = load_parquet_cached(CASINO_PROVIDERS_DAILY_PATH, "casino_providers_daily")
    if df.empty:
        return {"providers": []}
    if start and end and "date" in df.columns:
        df = _filter_range(df, start, end)
    if df.empty:
        return {"providers": []}
    out = (
        df.groupby("provider_name")
        .agg(stake=("stake", "sum"), winnings=("winnings", "sum"), bets=("bets", "sum"))
        .reset_index()
        .rename(columns={"provider_name": "provider"})
    )
    out["ggr"] = out["stake"] - out["winnings"]
    out["profit"] = out["ggr"]
    # carry casino_type from the most common type per provider
    if "casino_type" in df.columns:
        type_map = df.groupby("provider_name")["casino_type"].agg(lambda x: x.mode().iloc[0] if len(x) else "Casino")
        out["casino_type"] = out["provider"].map(type_map).fillna("Casino")
    return {"providers": out.sort_values("ggr", ascending=False).to_dict(orient="records")}


@app.get("/casino/types")
def casino_types(
    start: Optional[date] = Query(None),
    end: Optional[date] = Query(None),
):
    casino_dir = RAW_ROOT / "casino"
    full_file = casino_dir / "casino_full.parquet"
    raw_files = (
        ([full_file] if full_file.exists() else [])
        + sorted(casino_dir.glob("casino_increment_*.parquet"))
    )
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
# Cache
# ---------------------------------------------------------------------------
@app.post("/cache/clear")
def cache_clear():
    _PARQUET_CACHE.clear()
    _COHORT_CACHE["fingerprint"] = None
    _COHORT_CACHE["df"] = pd.DataFrame()
    _COHORT_CACHE["max_observed_date"] = None
    return {"ok": True}


@app.get("/")
def root():
    return {"message": "Playa Bets API v0.2 — see /docs for endpoints"}
