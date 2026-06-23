"""
core/filters.py — User/filter normalization and aggregation helpers.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import numpy as np
import pandas as pd

from src.kpis.io_utils import normalize_cols, read_all_parquets, to_dt
from backend.core.cache import (
    _PARQUET_CACHE,
    _COHORT_CACHE,
    _raw_files_fingerprint,
    DATA_START_DATE,
    USERS_RAW,
    RFM_USERS_PATH,
    load_parquet_cached,
    load_betslips_raw,
    load_casino_raw,
)
from backend.core.helpers import _filter_range

# ---------------------------------------------------------------------------
# Filter mappings (UI -> data values)
# ---------------------------------------------------------------------------
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


def _per_user_wagering(start: date, end: date, allowed_ids: set[str]) -> pd.DataFrame:
    """
    Per-user sports + casino wagering for a userid set over a period.

    Fast path: reads from vip_revenue_daily.parquet (pre-computed by build_domain_kpis).
    Slow path: loads all raw betslips + casino (fallback if serving file absent).
    """
    from backend.core.cache import VIP_REVENUE_DAILY_PATH

    # Fast path — serving file exists (built by pipeline)
    if VIP_REVENUE_DAILY_PATH.exists():
        df = load_parquet_cached(VIP_REVENUE_DAILY_PATH, "vip_revenue_daily")
        df = df[df["userid"].astype(str).isin(allowed_ids)]
        df["_date"] = pd.to_datetime(df["date"]).dt.date
        df = _filter_range(df, start, end)
        for c in ["sports_stake", "sports_winnings", "sports_bets", "casino_stake", "casino_winnings", "casino_bets"]:
            if c not in df.columns:
                df[c] = 0.0
        result = df.groupby("userid").agg(
            sports_stake=("sports_stake", "sum"),
            sports_winnings=("sports_winnings", "sum"),
            sports_bets=("sports_bets", "sum"),
            casino_stake=("casino_stake", "sum"),
            casino_winnings=("casino_winnings", "sum"),
            casino_bets=("casino_bets", "sum"),
        ).reset_index()
        result["userid"] = result["userid"].astype(str)
        return result

    # Slow path — raw betslips + casino (fallback)
    def _agg(df: pd.DataFrame, label: str) -> pd.DataFrame:
        empty = pd.DataFrame(columns=["userid", f"{label}_stake", f"{label}_winnings", f"{label}_bets"])
        if df.empty:
            return empty
        df, col = normalize_cols(df)
        placement = col.get("placementdate") or col.get("placedate") or col.get("betdate") or col.get("date")
        user_col = col.get("userid")
        stake_col = col.get("stake")
        win_col = col.get("winnings") or col.get("userwinnings")
        if not placement or not user_col:
            return empty
        df["_date"] = to_dt(df[placement]).dt.date
        df = _filter_range(df, start, end)
        df = df[df[user_col].astype(str).isin(allowed_ids)]
        if df.empty:
            return empty
        df["_uid"] = pd.to_numeric(df[user_col], errors="coerce").astype("Int64")
        df["_stake"] = pd.to_numeric(df[stake_col], errors="coerce").fillna(0.0) if stake_col else 0.0
        df["_win"] = pd.to_numeric(df[win_col], errors="coerce").fillna(0.0) if win_col else 0.0
        grp = df.groupby("_uid").agg(
            **{
                f"{label}_stake": ("_stake", "sum"),
                f"{label}_winnings": ("_win", "sum"),
                f"{label}_bets": ("_uid", "size"),
            }
        ).reset_index().rename(columns={"_uid": "userid"})
        return grp

    sports = _agg(load_betslips_raw(), "sports")
    casino = _agg(load_casino_raw(), "casino")

    if sports.empty and casino.empty:
        return pd.DataFrame(columns=[
            "userid", "sports_stake", "sports_winnings", "sports_bets",
            "casino_stake", "casino_winnings", "casino_bets",
        ])

    merged = sports.merge(casino, on="userid", how="outer")
    for c in ["sports_stake", "sports_winnings", "sports_bets", "casino_stake", "casino_winnings", "casino_bets"]:
        if c not in merged.columns:
            merged[c] = 0
        merged[c] = merged[c].fillna(0)
    merged["userid"] = pd.to_numeric(merged["userid"], errors="coerce").astype("Int64")
    return merged


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
    from backend.core.cache import _RAW  # local import to avoid circular at module level
    users_dir = _RAW / "users"
    ftd_dir = _RAW / "first_deposits"
    def _raw_files(directory, increment_glob: str, full_glob: str) -> list:
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
