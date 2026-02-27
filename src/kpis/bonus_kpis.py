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


def _first_deposit_campaign_ids(campaigns: pd.DataFrame) -> set[int]:
    """
    Infer first-deposit campaigns from BonusType text.
    Heuristic:
      - contains 'first' and 'deposit' in BonusType
    """
    if campaigns.empty:
        return set()

    camps, ccol = normalize_cols(campaigns)
    if "campaignid" not in ccol:
        return set()

    campaign_id = ccol["campaignid"]
    bonus_type_col = ccol.get("bonustype")
    if not bonus_type_col:
        return set()

    bt = camps[bonus_type_col].fillna("").astype(str).str.lower()
    mask = bt.str.contains("first", na=False) & bt.str.contains("deposit", na=False)
    if not mask.any():
        return set()

    ids = pd.to_numeric(camps.loc[mask, campaign_id], errors="coerce").dropna().astype(int)
    return set(ids.tolist())


def compute_bonus_daily(bonuses: pd.DataFrame, campaigns: pd.DataFrame | None = None) -> pd.DataFrame:
    """Daily bonus crediting metrics from view_BonusBonuses (+ first-deposit proxy from BonusType)."""
    if bonuses.empty:
        return pd.DataFrame(
            columns=[
                "date",
                "bonus_credited",
                "bonus_count",
                "unique_bonus_users",
                "first_deposit_bonus_count",
                "first_deposit_bonus_users",
                "first_deposit_bonus_amount",
            ]
        )

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

    # Filter to only actual bonus spend: Credited (5) and To Be Credited (2).
    # Cancelled (7) bonuses must be excluded — they were never paid out.
    status_id_col = bcol.get("bonusstatusid")
    status_str_col = bcol.get("bonusstatus")
    if status_id_col:
        bonuses = bonuses[pd.to_numeric(bonuses[status_id_col], errors="coerce").isin([2, 5])]
    elif status_str_col:
        bonuses = bonuses[bonuses[status_str_col].str.lower().isin(["credited", "to be credited"])]

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

    # First-deposit proxy:
    # derive daily users/amount from campaigns where BonusType implies first deposit.
    first_dep = pd.DataFrame(columns=["date", "first_deposit_bonus_count", "first_deposit_bonus_users", "first_deposit_bonus_amount"])
    if campaigns is not None and not campaigns.empty and "campaignid" in cols:
        campaign_col = cols["campaignid"]
        first_dep_ids = _first_deposit_campaign_ids(campaigns)
        if first_dep_ids:
            fd = bonuses[pd.to_numeric(bonuses[campaign_col], errors="coerce").astype("Int64").isin(first_dep_ids)].copy()
            if not fd.empty:
                first_dep = (
                    fd.dropna(subset=["bonus_date"])
                    .groupby("bonus_date")
                    .agg(
                        first_deposit_bonus_count=(bonus_id, "count"),
                        first_deposit_bonus_users=(user_id, "nunique"),
                        first_deposit_bonus_amount=("amount_num", "sum"),
                    )
                    .reset_index()
                    .rename(columns={"bonus_date": "date"})
                )

    out = out.merge(first_dep, on="date", how="left").fillna(0)
    out["bonus_credited"] = out["bonus_credited"].astype(float)
    out["bonus_count"]    = out["bonus_count"].astype(int)
    out["unique_bonus_users"] = out["unique_bonus_users"].astype(int)
    out["first_deposit_bonus_count"] = out["first_deposit_bonus_count"].astype(int)
    out["first_deposit_bonus_users"] = out["first_deposit_bonus_users"].astype(int)
    out["first_deposit_bonus_amount"] = out["first_deposit_bonus_amount"].astype(float)
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
