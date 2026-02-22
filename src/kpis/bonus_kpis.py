"""
bonus_kpis.py
--------------
Transforms bonus Parquet files into daily and summary KPIs.

compute_bonus_daily()  → date, bonus_credited, bonus_count, unique_bonus_users
compute_bonus_summary() → total_campaigns, active_campaigns, total_freebets,
                          active_freebets, total_bonus_amount
"""
from __future__ import annotations
import pandas as pd
from .io_utils import normalize_cols, ensure_cols, to_date, to_num


def compute_bonus_daily(bonuses: pd.DataFrame) -> pd.DataFrame:
    """Daily bonus crediting metrics from view_BonusBonuses."""
    if bonuses.empty:
        return pd.DataFrame(columns=["date", "bonus_credited", "bonus_count", "unique_bonus_users"])

    bonuses, bcol = normalize_cols(bonuses)
    cols = ensure_cols(
        bcol,
        required_lower=["bonusid", "userid", "amount", "insertdate"],
        context="BonusBonuses",
    )

    bonus_id = cols["bonusid"]
    user_id  = cols["userid"]
    amount   = cols["amount"]
    date_c   = cols["insertdate"]

    bonuses["amount_num"] = to_num(bonuses[amount], default=0.0)
    bonuses["bonus_date"] = to_date(bonuses[date_c])

    out = (
        bonuses.dropna(subset=["bonus_date"])
        .groupby("bonus_date")
        .agg(
            bonus_credited=("amount_num", "sum"),
            bonus_count=(bonus_id, "count"),
            unique_bonus_users=(user_id, "nunique"),
        )
        .reset_index()
        .rename(columns={"bonus_date": "date"})
    )
    out["bonus_credited"] = out["bonus_credited"].astype(float)
    out["bonus_count"]    = out["bonus_count"].astype(int)
    out["unique_bonus_users"] = out["unique_bonus_users"].astype(int)
    return out.sort_values("date")


def compute_bonus_summary(
    campaigns: pd.DataFrame,
    freebets: pd.DataFrame,
) -> dict:
    """Snapshot summary from campaigns and freebets reference tables."""
    summary: dict = {
        "total_campaigns": 0,
        "active_campaigns": 0,
        "total_freebets": 0,
        "active_freebets": 0,
        "total_freebet_amount": 0.0,
    }

    if not campaigns.empty:
        camps, ccol = normalize_cols(campaigns)
        summary["total_campaigns"] = int(len(camps))
        if "campaignstatusid" in ccol:
            # Status 1 = Active (from lookup table)
            active = camps[pd.to_numeric(camps[ccol["campaignstatusid"]], errors="coerce") == 1]
            summary["active_campaigns"] = int(len(active))
        elif "campaignstatus" in ccol:
            active = camps[camps[ccol["campaignstatus"]].str.lower().str.contains("active", na=False)]
            summary["active_campaigns"] = int(len(active))

    if not freebets.empty:
        fbs, fcol = normalize_cols(freebets)
        summary["total_freebets"] = int(len(fbs))
        if "freebetstatusid" in fcol:
            # Status 1 = Active / available
            active_fb = fbs[pd.to_numeric(fbs[fcol["freebetstatusid"]], errors="coerce") == 1]
            summary["active_freebets"] = int(len(active_fb))
        if "amount" in fcol:
            summary["total_freebet_amount"] = float(
                pd.to_numeric(fbs[fcol["amount"]], errors="coerce").fillna(0).sum()
            )

    return summary
