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

import sys
from datetime import date, datetime
from pathlib import Path
from typing import Optional, Literal

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

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
    _ROOT / "data" / "serving",
    _ROOT / "backend" / "data" / "serving",
)
_RAW = _first_existing_path(
    _ROOT / "data" / "raw",
    _ROOT / "backend" / "data" / "raw",
)
USERS_RAW = _first_existing_path(_RAW / "users", _RAW / "Users")
BETSLIPS_RAW = _first_existing_path(_RAW / "betslips", _RAW / "BetSlips")

DATA_PATH        = _SERVING / "daily_kpis.parquet"
RFM_USERS_PATH   = _SERVING / "rfm_users.parquet"
RFM_ROLLING_PATH = _SERVING / "rfm_rolling_daily.parquet"

# Domain-specific serving files (written by build_daily_kpis or domain scripts)
TX_DAILY_PATH          = _SERVING / "transactions_daily.parquet"
BONUS_DAILY_PATH       = _SERVING / "bonus_daily.parquet"
FTD_DAILY_PATH         = _SERVING / "ftd_daily.parquet"
CASINO_DAILY_PATH      = _SERVING / "casino_daily.parquet"

# Filter mappings (UI -> data values)
_COUNTRY_MAP = {
    "ng": "Nigeria",
    "gh": "Ghana",
    "ke": "Kenya",
    "ug": "Uganda",
    "zm": "Zambia",
}
_TERRITORY_COUNTRIES = {
    "west_africa": {"Nigeria", "Ghana"},
    "east_africa": {"Kenya", "Uganda"},
    "southern_africa": {"Zambia"},
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

        if inc_files:
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


def _filtered_registration_counts(
    start: date,
    end: date,
    territory: Optional[str] = None,
    country: Optional[str] = None,
    customer_status: Optional[str] = None,
) -> dict[date, int]:
    users = _apply_user_filters(_load_users_for_filters(), territory, country, customer_status)
    if users.empty or "creationdate" not in users.columns:
        return {}
    users = users.copy()
    users["creationdate"] = to_dt(users["creationdate"]).dt.date
    users = users[(users["creationdate"] >= start) & (users["creationdate"] <= end)]
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
) -> int:
    counts = _filtered_registration_counts(start, end, territory, country, customer_status)
    return int(sum(counts.values()))


def _load_latest_users() -> pd.DataFrame:
    users = read_all_parquets(USERS_RAW, "users_increment_*.parquet") if USERS_RAW.exists() else pd.DataFrame()
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
    user_files = sorted(users_dir.glob("users_increment_*.parquet")) if users_dir.exists() else []
    ftd_files = sorted(ftd_dir.glob("first_deposits_increment_*.parquet")) if ftd_dir.exists() else []
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

    out["rate_d7"] = out.apply(
        lambda r: (float(r["ftds_d7"]) / float(r["registrations"]) * 100.0) if r["registrations"] > 0 else 0.0,
        axis=1,
    )
    out["rate_d30"] = out.apply(
        lambda r: (float(r["ftds_d30"]) / float(r["registrations"]) * 100.0) if r["registrations"] > 0 else 0.0,
        axis=1,
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
        "ftd_daily": FTD_DAILY_PATH.exists(),
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
):
    df = _filter_range(load_daily_df(), start, end)
    tx = _filter_range(load_parquet_cached(TX_DAILY_PATH, "tx_daily"), start, end)
    bonus = _filter_range(load_parquet_cached(BONUS_DAILY_PATH, "bonus_daily"), start, end)
    ftd = _filter_range(load_parquet_cached(FTD_DAILY_PATH, "ftd_daily"), start, end)
    casino = _filter_range(load_parquet_cached(CASINO_DAILY_PATH, "casino_daily"), start, end)

    sportsbook_turnover = _s(df, "settled_stake") or _s(df, "placed_stake")
    sportsbook_winnings = _s(df, "settled_winnings")
    sportsbook_ggr = _s(df, "ggr")
    sportsbook_actives = _i(df, "actives_sports")

    casino_turnover = _s(casino, "casino_stake")
    casino_winnings = _s(casino, "casino_winnings")
    casino_ggr = _s(casino, "casino_ggr")
    casino_actives = _i(casino, "casino_actives")

    turnover = sportsbook_turnover + casino_turnover
    winnings = sportsbook_winnings + casino_winnings
    ggr = sportsbook_ggr + casino_ggr
    bonus_spent = _s(bonus, "bonus_credited")
    ngr = ggr - bonus_spent

    user_filtered = any(_normalize_value(v) for v in (territory, country, customer_status))
    filtered_registrations = (
        _filtered_registration_total(start, end, territory, country, customer_status) if user_filtered else None
    )

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
        "sportsbook_turnover": sportsbook_turnover,
        "sportsbook_winnings": sportsbook_winnings,
        "sportsbook_ggr": sportsbook_ggr,
        "casino_turnover": casino_turnover,
        "casino_winnings": casino_winnings,
        "casino_ggr": casino_ggr,
        "ftds": _i(ftd, "ftds"),
        "deposits": _s(tx, "deposits"),
        "withdrawals": _s(tx, "withdrawals"),
        "net_deposits": _s(tx, "net_deposits"),
        "bonus_spent": bonus_spent,
        "has_transactions_data": not tx.empty,
        "filters_applied": {
            "territory": bool(_normalize_value(territory)),
            "country": bool(_normalize_value(country)),
            "customer_status": bool(_normalize_value(customer_status)),
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
            {"date": str(r["date"]), "value": float(r[metric]) if pd.notna(r[metric]) else None}
            for _, r in d.iterrows()
        ],
    }


@app.get("/timeseries/registrations")
def registrations_timeseries(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
):
    user_filtered = any(_normalize_value(v) for v in (territory, country, customer_status))
    if user_filtered:
        counts = _filtered_registration_counts(start, end, territory, country, customer_status)
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
        for _, row in f.iterrows():
            ftd_by_date[row["date"]] = int(row.get("ftds", 0) or 0)

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
    return {
        "max_observed_date": str(max_observed_date) if max_observed_date else None,
        "points": [
            {
                "date": str(r["date"]),
                "registrations": int(r.get("registrations", 0)),
                "ftds_d7": int(r.get("ftds_d7", 0)),
                "ftds_d30": int(r.get("ftds_d30", 0)),
                "rate_d7": (float(r["rate_d7"]) if pd.notna(r.get("rate_d7")) else None),
                "rate_d30": (float(r["rate_d30"]) if pd.notna(r.get("rate_d30")) else None),
            }
            for _, r in d.iterrows()
        ],
    }


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
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
):
    df = load_daily_df()
    if df.empty:
        return {"path": str(DATA_PATH), "rows": []}
    d = df.copy()
    if start and end and "date" in d.columns:
        d = _filter_range(d, start, end)
        if any(_normalize_value(v) for v in (territory, country, customer_status)):
            regs_by_date = _filtered_registration_counts(start, end, territory, country, customer_status)
            if regs_by_date:
                d["registrations"] = d["date"].map(lambda x: int(regs_by_date.get(x, 0)))
            else:
                d["registrations"] = 0
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
):
    users = _apply_user_filters(_load_users_for_filters(), territory, country, customer_status)
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
        },
    }


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

# ---------------------------------------------------------------------------
# Betting
# ---------------------------------------------------------------------------
@app.get("/betting/betslips-by-status")
def betslips_by_status(
    start: date = Query(...),
    end: date = Query(...),
    territory: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    customer_status: Optional[str] = Query(None),
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
    if any(_normalize_value(v) for v in (territory, country, customer_status)) and user_id_col:
        users = _apply_user_filters(_load_users_for_filters(), territory, country, customer_status)
        if users.empty or "userid" not in users.columns:
            return []
        allowed_ids = set(users["userid"].astype(str).dropna())
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
):
    df = load_betslips_raw()
    if df.empty:
        return []
    df, bcol = normalize_cols(df)
    type_col = bcol.get("betsliptype") or bcol.get("betsliptypeid") or bcol.get("bettype") or bcol.get("bettypeid") or bcol.get("type")
    type_id_col = bcol.get("betsliptypeid") or bcol.get("bettypeid")
    placement_col = bcol.get("placementdate") or bcol.get("placedate") or bcol.get("betdate") or bcol.get("date")
    if not type_col or not placement_col:
        return []
    df["_date"] = to_dt(df[placement_col]).dt.date
    df = _filter_range(df, start, end)
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
    df = _filter_range(load_parquet_cached(TX_DAILY_PATH, "tx_daily"), start, end)
    return {
        "range": {"start": str(start), "end": str(end)},
        "has_data": not df.empty,
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
        return {"has_data": False, "deposits": [], "withdrawals": []}
    df = df.sort_values("date")
    return {
        "has_data": True,
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

    first_deposit_campaigns = 0
    if not campaigns.empty and "BonusType" in campaigns.columns:
        bt = campaigns["BonusType"].fillna("").astype(str).str.lower()
        first_deposit_campaigns = int((bt.str.contains("first", na=False) & bt.str.contains("deposit", na=False)).sum())

    total_freebets  = int(len(freebets)) if not freebets.empty else 0
    freebet_amount  = float(freebets["Amount"].sum()) if not freebets.empty and "Amount" in freebets.columns else 0.0

    return {
        "total_campaigns": total_campaigns,
        "active_campaigns": active_campaigns,
        "first_deposit_campaigns": first_deposit_campaigns,
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
            {
                "date": str(r["date"]),
                "bonus_credited": float(r.get("bonus_credited", 0)),
                "first_deposit_bonus_count": int(r.get("first_deposit_bonus_count", 0)),
                "first_deposit_bonus_users": int(r.get("first_deposit_bonus_users", 0)),
                "first_deposit_bonus_amount": float(r.get("first_deposit_bonus_amount", 0)),
            }
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
                "casino_actives": int(r.get("casino_actives", 0)) if pd.notna(r.get("casino_actives")) else 0,
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
