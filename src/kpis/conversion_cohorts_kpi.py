from __future__ import annotations

import pandas as pd

from .io_utils import normalize_cols, to_dt


def compute_conversion_cohorts_daily(users: pd.DataFrame, first_deposits: pd.DataFrame) -> pd.DataFrame:
    """
    Cohort conversion series dated to registration day.

    Output columns:
      date, registrations, ftds_d7, ftds_d30, rate_d7, rate_d30
    """
    empty = pd.DataFrame(
        columns=["date", "registrations", "ftds_d7", "ftds_d30", "rate_d7", "rate_d30"]
    )
    if users.empty or first_deposits.empty:
        return empty

    users, ucol = normalize_cols(users)
    first_deposits, fcol = normalize_cols(first_deposits)

    uid_col = ucol.get("userid")
    creation_col = ucol.get("creationdate")
    ftd_uid_col = fcol.get("idutente")
    ftd_date_col = fcol.get("dataprimodeposito")
    if not uid_col or not creation_col or not ftd_uid_col or not ftd_date_col:
        return empty

    users["_uid"] = pd.to_numeric(users[uid_col], errors="coerce")
    users["_creation_dt"] = pd.to_datetime(users[creation_col], errors="coerce")
    users = users.dropna(subset=["_uid", "_creation_dt"]).copy()

    test_col = ucol.get("testuser")
    if test_col:
        users = users[pd.to_numeric(users[test_col], errors="coerce").fillna(0).astype(int) == 0].copy()

    users = users.sort_values("_creation_dt").drop_duplicates(subset=["_uid"], keep="first")
    users["date"] = users["_creation_dt"].dt.date

    first_deposits["_uid"] = pd.to_numeric(first_deposits[ftd_uid_col], errors="coerce")
    first_deposits["_ftd_dt"] = to_dt(first_deposits[ftd_date_col])
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

    if pd.notna(max_observed_date):
        observed_dt = pd.Timestamp(max_observed_date)
        cohort_dt = pd.to_datetime(out["date"], errors="coerce")
        mature_d7 = cohort_dt + pd.Timedelta(days=7) <= observed_dt
        mature_d30 = cohort_dt + pd.Timedelta(days=30) <= observed_dt
        out.loc[~mature_d7, "rate_d7"] = pd.NA
        out.loc[~mature_d30, "rate_d30"] = pd.NA

    return out.sort_values("date")
