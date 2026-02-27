"""
users_and_segments_kpi.py
-------------------------
Builds users-by-segment KPI outputs from users increment parquet files.

Outputs:
  - data/serving/users_segments_daily.parquet
      date, userprofileid, userprofile, registrations
  - data/serving/users_segments_latest.parquet
      userprofileid, userprofile, users

Run from project root:
  python -m src.kpis.users_and_segments_kpi
"""
from __future__ import annotations

from pathlib import Path
import pandas as pd

from .io_utils import normalize_cols, ensure_cols, to_dt, read_all_parquets


def _to_int(series: pd.Series, default: int = 0) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(default).astype(int)


def _clean_profile_values(df: pd.DataFrame, profile_col: str, profile_id_col: str) -> pd.DataFrame:
    out = df.copy()
    out[profile_col] = out[profile_col].fillna("Unknown").astype(str).str.strip()
    out.loc[out[profile_col] == "", profile_col] = "Unknown"
    out[profile_id_col] = _to_int(out[profile_id_col], 0)
    return out


def _dedupe_first_registration(users: pd.DataFrame) -> pd.DataFrame:
    users, ucol = normalize_cols(users)
    cols = ensure_cols(
        ucol,
        required_lower=["userid", "creationdate", "userprofileid", "userprofile"],
        context="Users",
    )

    user_id = cols["userid"]
    creation = cols["creationdate"]
    profile_id = cols["userprofileid"]
    profile = cols["userprofile"]

    test_col = ucol.get("testuser")
    if test_col:
        users = users[users[test_col].fillna(0).astype(int) == 0]

    users = _clean_profile_values(users, profile, profile_id)
    users["_reg_dt"] = to_dt(users[creation])

    return (
        users.dropna(subset=["_reg_dt"])
        .sort_values("_reg_dt")
        .drop_duplicates(subset=[user_id], keep="first")
        .copy()
    )


def _dedupe_latest_profile(users: pd.DataFrame) -> pd.DataFrame:
    users, ucol = normalize_cols(users)
    cols = ensure_cols(
        ucol,
        required_lower=["userid", "userprofileid", "userprofile"],
        context="Users",
    )

    user_id = cols["userid"]
    profile_id = cols["userprofileid"]
    profile = cols["userprofile"]

    test_col = ucol.get("testuser")
    if test_col:
        users = users[users[test_col].fillna(0).astype(int) == 0]

    users = _clean_profile_values(users, profile, profile_id)

    # Prefer DateVersion for latest snapshot; fallback to creation/lastlogin.
    sort_col = None
    for candidate in ("dateversion", "detaildateversion", "creationdate", "lastlogin"):
        if candidate in ucol:
            sort_col = ucol[candidate]
            break

    if sort_col is not None:
        users["_sort_dt"] = to_dt(users[sort_col])
        ordered = users.sort_values("_sort_dt")
    else:
        ordered = users

    return ordered.drop_duplicates(subset=[user_id], keep="last").copy()


def compute_users_segments_daily(users: pd.DataFrame) -> pd.DataFrame:
    """
    Daily registrations by profile segment.
    Columns: date, userprofileid, userprofile, registrations
    """
    if users.empty:
        return pd.DataFrame(columns=["date", "userprofileid", "userprofile", "registrations"])

    first = _dedupe_first_registration(users)
    first, ucol = normalize_cols(first)

    user_id = ucol["userid"]
    creation = ucol["creationdate"]
    profile_id = ucol["userprofileid"]
    profile = ucol["userprofile"]

    first["date"] = pd.to_datetime(first[creation], errors="coerce").dt.date

    out = (
        first.dropna(subset=["date"])
        .groupby(["date", profile_id, profile], as_index=False)[user_id]
        .nunique()
        .rename(columns={user_id: "registrations", profile_id: "userprofileid", profile: "userprofile"})
        .sort_values(["date", "userprofile"])
    )

    out["registrations"] = out["registrations"].astype(int)
    out["userprofileid"] = _to_int(out["userprofileid"], 0)
    return out[["date", "userprofileid", "userprofile", "registrations"]]


def compute_users_segments_latest(users: pd.DataFrame) -> pd.DataFrame:
    """
    Latest profile distribution across unique users.
    Columns: userprofileid, userprofile, users
    """
    if users.empty:
        return pd.DataFrame(columns=["userprofileid", "userprofile", "users"])

    latest = _dedupe_latest_profile(users)
    latest, ucol = normalize_cols(latest)

    user_id = ucol["userid"]
    profile_id = ucol["userprofileid"]
    profile = ucol["userprofile"]

    out = (
        latest.groupby([profile_id, profile], as_index=False)[user_id]
        .nunique()
        .rename(columns={user_id: "users", profile_id: "userprofileid", profile: "userprofile"})
        .sort_values("users", ascending=False)
    )

    out["users"] = out["users"].astype(int)
    out["userprofileid"] = _to_int(out["userprofileid"], 0)
    return out[["userprofileid", "userprofile", "users"]]


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    users_dir = project_root / "data" / "raw" / "users"
    serving_dir = project_root / "data" / "serving"
    out_daily = serving_dir / "users_segments_daily.parquet"
    out_latest = serving_dir / "users_segments_latest.parquet"

    serving_dir.mkdir(parents=True, exist_ok=True)

    users = read_all_parquets(users_dir, "users_increment_*.parquet")
    daily = compute_users_segments_daily(users)
    latest = compute_users_segments_latest(users)

    daily.to_parquet(out_daily, index=False)
    latest.to_parquet(out_latest, index=False)

    print(f"Wrote users segments daily: {out_daily} ({len(daily)} rows)")
    print(f"Wrote users segments latest: {out_latest} ({len(latest)} rows)")


if __name__ == "__main__":
    main()
