"""
core/cache.py — Parquet cache, path constants, and data-loading helpers.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.app_config import RAW_ROOT, SERVING_ROOT

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
DAILY_KPIS_PATH  = DATA_PATH  # alias used in sportsbook router (mirrors original app.py bug)
RFM_USERS_PATH          = _SERVING / "rfm_users.parquet"
RFM_ROLLING_PATH        = _SERVING / "rfm_rolling_daily.parquet"
RFM_MONTHLY_PATH        = _SERVING / "rfm_monthly_snapshots.parquet"

# Domain-specific serving files (written by build_daily_kpis or domain scripts)
TX_DAILY_PATH               = _SERVING / "transactions_daily.parquet"
BONUS_DAILY_PATH            = _SERVING / "bonus_daily.parquet"
FTD_DAILY_PATH              = _SERVING / "ftd_daily.parquet"
FTD_REG_MONTH_DAILY_PATH    = _SERVING / "ftd_reg_month_daily.parquet"
ACTIVES_MONTHLY_PATH        = _SERVING / "actives_monthly.parquet"
CHURN_MONTHLY_PATH          = _SERVING / "churn_monthly.parquet"
TOTAL_ACTIVES_MONTHLY_PATH  = _SERVING / "total_actives_monthly.parquet"
DEPOSITORS_MONTHLY_PATH     = _SERVING / "depositors_monthly.parquet"
CASINO_DAILY_PATH           = _SERVING / "casino_daily.parquet"
CASINO_PROVIDERS_DAILY_PATH = _SERVING / "casino_providers_daily.parquet"
SELFEXCLUSIONS_PATH    = _RAW / "selfexclusions" / "selfexclusions_current_latest.parquet"
SOCIOTOPO_PATH         = _SERVING / "sociotopo_features.parquet"
TAXES_RAW_DIR          = _RAW / "taxes"
VIP_LIST_PATH           = _ROOT / "vip_list.csv"
VIP_ROSTER_PATH         = _SERVING / "vip_roster.parquet"

# Earliest date for which all data sources (casino, FTD, bonus, sportsbook) are complete.
# Pre-Jan 2026 rows exist in daily_kpis but have zero casino/FTD/bonus — exclude them.
DATA_START_DATE = date(2026, 1, 1)

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
