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


def _compute_freebets_daily(freebets: pd.DataFrame) -> pd.DataFrame:
    """
    Daily free-bet ISSUED amounts from view_BonusFreebets.
    Counts all freebets by InsertDate (the date they were granted), regardless of
    whether they were later used, expired, or cancelled.  This is the face-value
    liability committed to players.

    Also returns freebet_spend (status=2, actually used) as a separate column
    for reference.

    Returns: date, freebet_issued, freebet_issued_count, freebet_spend
    """
    empty = pd.DataFrame(columns=["date", "freebet_issued", "freebet_issued_count", "freebet_spend"])
    if freebets.empty:
        return empty

    fb, fcol = normalize_cols(freebets)
    if "insertdate" not in fcol or "amount" not in fcol:
        return empty

    fb["freebet_date"] = to_date(fb[fcol["insertdate"]])
    fb["amount_num"] = to_num(fb[fcol["amount"]], default=0.0)
    fb = fb.dropna(subset=["freebet_date"])
    if fb.empty:
        return empty

    # All issued freebets (any status)
    issued = (
        fb.groupby("freebet_date")
        .agg(
            freebet_issued=("amount_num", "sum"),
            freebet_issued_count=("amount_num", "count"),
        )
        .reset_index()
        .rename(columns={"freebet_date": "date"})
    )

    # Used freebets (status=2) kept as reference column
    if "freebetstatusid" in fcol:
        used = fb[pd.to_numeric(fb[fcol["freebetstatusid"]], errors="coerce") == 2]
        if not used.empty:
            used_agg = (
                used.groupby("freebet_date")
                .agg(freebet_spend=("amount_num", "sum"))
                .reset_index()
                .rename(columns={"freebet_date": "date"})
            )
            issued = issued.merge(used_agg, on="date", how="left")
        else:
            issued["freebet_spend"] = 0.0
    else:
        issued["freebet_spend"] = 0.0

    return issued.fillna(0)


def compute_bonus_daily(
    bonuses: pd.DataFrame,
    campaigns: pd.DataFrame | None = None,
    freebets: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """
    Daily bonus crediting metrics from view_BonusBonuses.

    bonus_credited  = BonusStatusID in [2,5] amounts minus reversed bonuses
                      (CancellationBonusTransazionID IS NOT NULL records excluded).
    freebet_issued  = All freebets by InsertDate (any status — face value committed).
    freebet_spend   = FreeBetStatusId=2 only (actually played) — reference column.
    bonus_total     = bonus_credited + freebet_issued  (total bonus exposure for NGR).
    """
    if bonuses.empty:
        return pd.DataFrame(
            columns=[
                "date",
                "bonus_credited",
                "bonus_count",
                "unique_bonus_users",
                "freebet_issued",
                "freebet_issued_count",
                "freebet_spend",
                "bonus_total",
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

    # Exclude reversal records first (CancellationBonusTransazionID IS NOT NULL = reversal).
    cancellation_col = bcol.get("cancellationbonustransazionid")
    if cancellation_col:
        bonuses = bonuses[bonuses[cancellation_col].isna()]

    # Filter to only credited bonuses: status 2 (To Be Credited) or 5 (Credited).
    # Do this BEFORE deduplication so cancelled (7) updates don't wipe out
    # original credit records with the same BonusID.
    status_id_col = bcol.get("bonusstatusid")
    status_str_col = bcol.get("bonusstatus")
    if status_id_col:
        bonuses = bonuses[pd.to_numeric(bonuses[status_id_col], errors="coerce").isin([2, 5])]
    elif status_str_col:
        bonuses = bonuses[bonuses[status_str_col].str.lower().isin(["credited", "to be credited"])]

    # Dedup after status filter: keep latest credited record per BonusID.
    order_col = bcol.get("__cursor__") or bcol.get("insertdate")
    bonuses["_ord"] = pd.to_datetime(bonuses[order_col], errors="coerce")
    bonuses = bonuses.sort_values("_ord").drop_duplicates(subset=[bonus_id], keep="last")

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

    # Merge free-bet daily data (issued = face value committed; spend = actually used)
    fb_daily = (
        _compute_freebets_daily(freebets)
        if freebets is not None and not freebets.empty
        else pd.DataFrame(columns=["date", "freebet_issued", "freebet_issued_count", "freebet_spend"])
    )
    out = out.merge(fb_daily, on="date", how="left").fillna(0)

    out["bonus_credited"]    = out["bonus_credited"].astype(float)
    out["bonus_count"]       = out["bonus_count"].astype(int)
    out["unique_bonus_users"]= out["unique_bonus_users"].astype(int)
    out["freebet_issued"]    = out["freebet_issued"].astype(float)
    out["freebet_issued_count"] = out["freebet_issued_count"].astype(int)
    out["freebet_spend"]     = out["freebet_spend"].astype(float)
    # bonus_total = net credited bonuses + all freebets issued (total bonus exposure)
    out["bonus_total"]       = out["bonus_credited"] + out["freebet_issued"]
    out["first_deposit_bonus_count"]  = out["first_deposit_bonus_count"].astype(int)
    out["first_deposit_bonus_users"]  = out["first_deposit_bonus_users"].astype(int)
    out["first_deposit_bonus_amount"] = out["first_deposit_bonus_amount"].astype(float)
    return out.sort_values("date")


def compute_bonus_transactions_daily(bonus_tx: pd.DataFrame) -> pd.DataFrame:
    """Daily bonus issued/reversed from view_BonusTransactions (ReasonID 64=issued, 65=reversed).
    This matches the client's Grafana SQL which uses BonusTransazioni with IDCausale IN (64, 65).
    """
    empty = pd.DataFrame(columns=["date", "bonus_tx_issued", "bonus_tx_reversed", "bonus_tx_net"])
    if bonus_tx.empty:
        return empty

    bonus_tx, bcol = normalize_cols(bonus_tx)
    date_col = bcol.get("date")
    reason_col = bcol.get("reasonid")
    amount_col = bcol.get("amount")

    if not date_col or not reason_col or not amount_col:
        return empty

    bonus_tx["_date"] = to_date(bonus_tx[date_col])
    bonus_tx["_amount"] = to_num(bonus_tx[amount_col], default=0.0)
    bonus_tx["_reason"] = pd.to_numeric(bonus_tx[reason_col], errors="coerce")

    issued   = bonus_tx[bonus_tx["_reason"] == 64].groupby("_date")["_amount"].sum().rename("bonus_tx_issued")
    reversed_ = bonus_tx[bonus_tx["_reason"] == 65].groupby("_date")["_amount"].sum().rename("bonus_tx_reversed")

    out = pd.DataFrame({"date": bonus_tx["_date"].dropna().unique()})
    out = out.merge(issued.reset_index().rename(columns={"_date": "date"}), on="date", how="left")
    out = out.merge(reversed_.reset_index().rename(columns={"_date": "date"}), on="date", how="left")
    out = out.fillna(0)
    out["bonus_tx_net"] = out["bonus_tx_issued"] - out["bonus_tx_reversed"]
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
