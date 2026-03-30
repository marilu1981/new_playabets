from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import pandas as pd

from .io_utils import normalize_cols, ensure_cols, to_dt, to_date, to_num


@dataclass(frozen=True)
class RFMWindow:
    days: int = 30   # rolling window length for F and M
    recency_cap_days: int = 365  # cap recency to avoid huge outliers


def _score_quantiles(
    series: pd.Series,
    ascending: bool,
    labels=(1, 2, 3, 4, 5),
    zero_is_lowest: bool = False,
) -> pd.Series:
    """
    Return 1..5 score based on quintiles.
    For recency: smaller is better => ascending=True.
    For frequency/monetary: larger is better => ascending=False.
    """
    s = pd.to_numeric(series.copy(), errors="coerce")
    scores = pd.Series(3, index=s.index, dtype=int)

    if zero_is_lowest:
        zero_mask = s.fillna(0) <= 0
        scores.loc[zero_mask] = 1
        s = s.loc[~zero_mask]

    # handle constant/empty after removing forced-low rows
    if s.empty:
        return scores
    if s.nunique(dropna=True) <= 1:
        fill_score = 5 if (not ascending and s.iloc[0] > 0) else 3
        scores.loc[s.index] = fill_score
        return scores

    # use average rank so ties stay together instead of being split arbitrarily
    ranks = s.rank(method="average", ascending=ascending)
    try:
        scored = pd.qcut(ranks, 5, labels=labels).astype(int)
    except ValueError:
        # if qcut fails due to duplicates, fallback to cut on ranks
        scored = pd.cut(ranks, bins=5, labels=labels, include_lowest=True).astype(int)

    scores.loc[scored.index] = scored
    return scores


def build_rfm_users(
    users: pd.DataFrame,
    betslips: pd.DataFrame,
    casino: Optional[pd.DataFrame],
    sessions: Optional[pd.DataFrame],
    first_deposits: Optional[pd.DataFrame] = None,
    as_of: Optional[pd.Timestamp] = None,
    window: RFMWindow = RFMWindow(),
) -> pd.DataFrame:
    """
    Returns per-user RFM table.

    Inputs expected:
    - users: contains userid (+ optional userstatus, testuser)
    - betslips: contains userid, placementdate, paymentdate, stake, winnings, betslipstatus
    - casino: contains userid, placementdate, stake, winnings, betsnumber
    - sessions: contains userid, logindate (and optional logoutdate)
    """
    if as_of is None:
        as_of = pd.Timestamp.now(tz=None).normalize()  # local time, midnight
    as_of_date = as_of.date()
    start_dt = (as_of - pd.Timedelta(days=window.days)).to_pydatetime()

    # --- Users base
    users, ucol = normalize_cols(users)
    ureq = ensure_cols(ucol, ["userid"], "Users")
    uid_u = ureq["userid"]

    test_col = ucol.get("testuser")
    status_col = ucol.get("userstatus")
    lastlogin_col = ucol.get("lastlogin")
    creation_col = next((ucol.get(k) for k in ["creationdate", "registrationdate", "registration_date"] if ucol.get(k)), None)

    base = users[[uid_u]].drop_duplicates().copy()
    base = base.rename(columns={uid_u: "userid"})

    # attach testuser and userstatus WITHOUT creating duplicate userid columns
    cols_to_add = []
    if test_col:
        cols_to_add.append(test_col)
    if status_col:
        cols_to_add.append(status_col)
    if lastlogin_col:
        cols_to_add.append(lastlogin_col)
    if creation_col:
        cols_to_add.append(creation_col)

    if cols_to_add:
        add_df = users[[uid_u] + cols_to_add].copy()
        if lastlogin_col and lastlogin_col in add_df.columns:
            add_df["_user_ord"] = to_dt(add_df[lastlogin_col])
        else:
            add_df["_user_ord"] = pd.NaT
        add_df = add_df.sort_values("_user_ord").drop_duplicates(subset=[uid_u], keep="last")
        add_df = add_df.drop(columns=["_user_ord"])
        add_df = add_df.rename(columns={uid_u: "userid"})
        base = base.merge(add_df, on="userid", how="left")

    # filter test users if present
    if test_col and test_col in base.columns:
        base = base[base[test_col].fillna(0).astype(int) == 0]

    # rename status to consistent name
    if status_col and status_col in base.columns:
        base = base.rename(columns={status_col: "userstatus"})

    # --- Product activity: sportsbook + casino
    betting_agg = pd.DataFrame(columns=["userid", "bets_30d", "active_bet_days_30d", "stake_30d"])
    monetary_agg = pd.DataFrame(columns=["userid", "settled_stake_30d", "settled_winnings_30d", "ggr_30d"])
    casino_agg = pd.DataFrame(
        columns=[
            "userid",
            "casino_bets_30d",
            "casino_active_days_30d",
            "casino_stake_30d",
            "casino_winnings_30d",
            "casino_ggr_30d",
        ]
    )
    sportsbook_last_activity = pd.DataFrame(columns=["userid", "last_sports_activity_dt"])
    casino_last_activity = pd.DataFrame(columns=["userid", "last_casino_activity_dt"])
    activity_presence_frames: list[pd.DataFrame] = []

    if betslips is not None and not betslips.empty:
        betslips, bcol = normalize_cols(betslips)
        breq = ensure_cols(bcol, ["userid", "stake", "winnings"], "Betslips")
        uid_b = breq["userid"]
        stake_c = breq["stake"]
        win_c = breq["winnings"]

        placement_c = bcol.get("placementdate")
        payment_c = bcol.get("paymentdate")
        status_b = bcol.get("betslipstatus")

        bs = betslips.copy()
        bs["userid"] = bs[uid_b].astype("int64", errors="ignore")
        bs["stake_num"] = to_num(bs[stake_c], 0.0)
        bs["winnings_num"] = to_num(bs[win_c], 0.0)
        bs["activity_dt"] = to_dt(bs[placement_c]) if placement_c else pd.NaT
        if payment_c:
            bs["settlement_dt"] = to_dt(bs[payment_c])
        else:
            bs["settlement_dt"] = bs["activity_dt"]

        sportsbook_last_activity = (
            bs.dropna(subset=["activity_dt"])
            .groupby("userid")["activity_dt"]
            .max()
            .rename("last_sports_activity_dt")
            .reset_index()
        )

        bs_win = bs[
            (bs["activity_dt"].notna())
            & (bs["activity_dt"] >= pd.Timestamp(start_dt))
            & (bs["activity_dt"] <= as_of + pd.Timedelta(days=1))
        ].copy()
        bs_win["activity_day"] = bs_win["activity_dt"].dt.floor("D")

        if not bs_win.empty:
            activity_presence_frames.append(
                bs_win[["userid", "activity_day"]].drop_duplicates()
            )
            betting_agg = (
                bs_win.groupby("userid")
                .agg(
                    bets_30d=("userid", "size"),
                    active_bet_days_30d=("activity_day", "nunique"),
                    stake_30d=("stake_num", "sum"),
                )
                .reset_index()
            )

        bs_settled = bs[
            (bs["settlement_dt"].notna())
            & (bs["settlement_dt"] >= pd.Timestamp(start_dt))
            & (bs["settlement_dt"] <= as_of + pd.Timedelta(days=1))
        ].copy()
        if status_b:
            bs_settled = bs_settled[bs_settled[status_b].astype(str).eq("Paid - Closed")].copy()
        if not bs_settled.empty:
            bs_settled["ggr"] = bs_settled["stake_num"] - bs_settled["winnings_num"]
            monetary_agg = (
                bs_settled.groupby("userid")
                .agg(
                    settled_stake_30d=("stake_num", "sum"),
                    settled_winnings_30d=("winnings_num", "sum"),
                    ggr_30d=("ggr", "sum"),
                )
                .reset_index()
            )

    if casino is not None and not casino.empty:
        casino, ccol = normalize_cols(casino)
        creq = ensure_cols(ccol, ["userid", "placementdate", "stake", "winnings"], "Casino")
        uid_c = creq["userid"]
        casino_date_c = creq["placementdate"]
        casino_stake_c = creq["stake"]
        casino_winnings_c = creq["winnings"]
        casino_bets_c = ccol.get("betsnumber")

        cs = casino.copy()
        cs["userid"] = cs[uid_c].astype("int64", errors="ignore")
        cs["activity_dt"] = to_dt(cs[casino_date_c])
        cs["activity_day"] = cs["activity_dt"].dt.floor("D")
        cs["stake_num"] = to_num(cs[casino_stake_c], 0.0)
        cs["winnings_num"] = to_num(cs[casino_winnings_c], 0.0)
        if casino_bets_c:
            cs["casino_bets_num"] = to_num(cs[casino_bets_c], 0.0)
        else:
            cs["casino_bets_num"] = 1.0

        casino_last_activity = (
            cs.dropna(subset=["activity_dt"])
            .groupby("userid")["activity_dt"]
            .max()
            .rename("last_casino_activity_dt")
            .reset_index()
        )

        cs_win = cs[
            (cs["activity_dt"].notna())
            & (cs["activity_dt"] >= pd.Timestamp(start_dt))
            & (cs["activity_dt"] <= as_of + pd.Timedelta(days=1))
        ].copy()
        if not cs_win.empty:
            activity_presence_frames.append(
                cs_win[["userid", "activity_day"]].drop_duplicates()
            )
            casino_agg = (
                cs_win.groupby("userid")
                .agg(
                    casino_bets_30d=("casino_bets_num", "sum"),
                    casino_active_days_30d=("activity_day", "nunique"),
                    casino_stake_30d=("stake_num", "sum"),
                    casino_winnings_30d=("winnings_num", "sum"),
                )
                .reset_index()
            )
            casino_agg["casino_ggr_30d"] = casino_agg["casino_stake_30d"] - casino_agg["casino_winnings_30d"]

    if activity_presence_frames:
        product_presence = pd.concat(activity_presence_frames, ignore_index=True).drop_duplicates()
        product_activity = (
            product_presence.groupby("userid")
            .agg(total_active_days_30d=("activity_day", "nunique"))
            .reset_index()
        )
    else:
        product_activity = pd.DataFrame(columns=["userid", "total_active_days_30d"])
    # --- Sessions: recency + login frequency (preferred)
    if sessions is not None and not sessions.empty:
        sessions, scol = normalize_cols(sessions)
        sreq = ensure_cols(scol, ["userid", "logindate"], "UserSessions")
        uid_s = sreq["userid"]
        login_c = sreq["logindate"]

        ss = sessions.copy()
        ss["userid"] = ss[uid_s].astype("int64", errors="ignore")
        ss["login_dt"] = to_dt(ss[login_c])

        # Recency uses last login overall (not only window)
        last_login = (
            ss.dropna(subset=["login_dt"])
            .groupby("userid")["login_dt"]
            .max()
            .rename("last_login_dt")
            .reset_index()
        )

        # Login frequency within window
        ss_win = ss[
            (ss["login_dt"].notna()) &
            (ss["login_dt"] >= pd.Timestamp(start_dt)) &
            (ss["login_dt"] <= as_of + pd.Timedelta(days=1))
        ]
        login_freq = (
            ss_win.groupby("userid")
                .agg(
                    sessions_30d=("userid", "size"),
                    active_login_days_30d=("login_dt", lambda x: x.dt.date.nunique()),
                )
                .reset_index()
        )

    # --- Fallback: use users.lastlogin for recency when sessions are not available
    else:
        if lastlogin_col:
            tmp = users[[uid_u, lastlogin_col]].copy()
            tmp = tmp.rename(columns={uid_u: "userid", lastlogin_col: "last_login_dt"})
            tmp["last_login_dt"] = to_dt(tmp["last_login_dt"])

            last_login = (
                tmp.dropna(subset=["last_login_dt"])
                .groupby("userid")["last_login_dt"]
                .max()
                .reset_index()
            )
        else:
            last_login = pd.DataFrame(columns=["userid", "last_login_dt"])

        # No session frequency available
        login_freq = pd.DataFrame(columns=["userid", "sessions_30d", "active_login_days_30d"])
        # login_freq = pd.DataFrame(columns=["userid", "sessions_30d", "active_login_days_30d"])

    # --- First deposits: used for "New" segment
    ftd_recency = pd.DataFrame(columns=["userid", "ftd_date"])
    if first_deposits is not None and not first_deposits.empty:
        fd, fdcol = normalize_cols(first_deposits)
        uid_fd = fdcol.get("idutente") or fdcol.get("userid")
        date_fd = fdcol.get("dataprimodeposito") or fdcol.get("ftd_date") or fdcol.get("firstdepositdate")
        if uid_fd and date_fd:
            ftd_recency = fd[[uid_fd, date_fd]].copy()
            ftd_recency = ftd_recency.rename(columns={uid_fd: "userid", date_fd: "ftd_date"})
            ftd_recency["userid"] = ftd_recency["userid"].astype("int64", errors="ignore")
            ftd_recency["ftd_date"] = to_dt(ftd_recency["ftd_date"])
            ftd_recency = ftd_recency.dropna(subset=["ftd_date"]).sort_values("ftd_date").drop_duplicates(subset=["userid"], keep="first")

    # --- Merge into RFM user table
    rfm = base.merge(last_login, on="userid", how="left")
    rfm = rfm.merge(sportsbook_last_activity, on="userid", how="left")
    rfm = rfm.merge(casino_last_activity, on="userid", how="left")
    rfm = rfm.merge(login_freq, on="userid", how="left")
    rfm = rfm.merge(betting_agg, on="userid", how="left")
    rfm = rfm.merge(monetary_agg, on="userid", how="left")
    rfm = rfm.merge(casino_agg, on="userid", how="left")
    rfm = rfm.merge(product_activity, on="userid", how="left")
    if not ftd_recency.empty:
        rfm = rfm.merge(ftd_recency[["userid", "ftd_date"]], on="userid", how="left")

    for c in [
        "sessions_30d",
        "active_login_days_30d",
        "bets_30d",
        "active_bet_days_30d",
        "casino_bets_30d",
        "casino_active_days_30d",
        "total_active_days_30d",
    ]:
        if c in rfm.columns:
            rfm[c] = rfm[c].fillna(0).astype(int)
    for c in [
        "stake_30d",
        "settled_stake_30d",
        "settled_winnings_30d",
        "ggr_30d",
        "casino_stake_30d",
        "casino_winnings_30d",
        "casino_ggr_30d",
    ]:
        if c in rfm.columns:
            rfm[c] = rfm[c].fillna(0.0).astype(float)

    rfm["total_product_events_30d"] = (
        rfm["bets_30d"].fillna(0).astype(int)
        + rfm["casino_bets_30d"].fillna(0).astype(int)
    )

    activity_cols = [
        c
        for c in ["last_login_dt", "last_sports_activity_dt", "last_casino_activity_dt"]
        if c in rfm.columns
    ]
    if activity_cols:
        rfm["last_activity_dt"] = rfm[activity_cols].max(axis=1)
    else:
        rfm["last_activity_dt"] = pd.NaT

    # Recency days
    rfm["recency_days"] = rfm["last_activity_dt"].apply(
        lambda d: (as_of_date - d.date()).days if pd.notna(d) else window.recency_cap_days
    )
    rfm["recency_days"] = rfm["recency_days"].clip(lower=0, upper=window.recency_cap_days).astype(int)

    # Choose Frequency for scoring on a per-user basis:
    # - use sessions_30d when that user has session activity
    # - otherwise fall back to combined sportsbook + casino activity
    if "sessions_30d" in rfm.columns:
        has_session_activity = rfm["sessions_30d"].fillna(0).astype(int) > 0
        rfm["frequency_30d"] = (
            rfm["sessions_30d"]
            .where(has_session_activity, rfm["total_product_events_30d"])
            .fillna(0)
            .astype(int)
        )
        rfm["frequency_basis"] = pd.Series("product_activity", index=rfm.index)
        rfm.loc[has_session_activity, "frequency_basis"] = "sessions"
    else:
        rfm["frequency_30d"] = rfm["total_product_events_30d"].fillna(0).astype(int)
        rfm["frequency_basis"] = "product_activity"

    # Cross-product value proxy:
    # sportsbook settled stake + casino stake over the rolling window.
    rfm["monetary_30d"] = (
        rfm["settled_stake_30d"].fillna(0.0).astype(float)
        + rfm["casino_stake_30d"].fillna(0.0).astype(float)
    )

    # Scores (kept for reference / drill-down, not used for segmentation)
    rfm["r_score"] = _score_quantiles(rfm["recency_days"], ascending=True)
    rfm["f_score"] = _score_quantiles(rfm["frequency_30d"], ascending=False, zero_is_lowest=True)
    rfm["m_score"] = _score_quantiles(rfm["monetary_30d"], ascending=False, zero_is_lowest=True)
    rfm["rfm_score"] = rfm["r_score"] * 100 + rfm["f_score"] * 10 + rfm["m_score"]

    # ── Activity-based segmentation ───────────────────────────────────────────
    # Segments are based on recency_days and monetary_30d so every user is
    # placed into exactly one meaningful bucket that maps to a CRM action.
    #
    #   VIP       – active in last 30 days AND top 10% by monetary value
    #   Active    – active in last 30 days (below VIP threshold)
    #   New       – registered in last 30 days (may overlap Active; New wins)
    #   At Risk   – last activity was 31–90 days ago
    #   Lapsed    – last activity was 91–180 days ago
    #   Dormant   – no activity in 180+ days (or never active)

    # Top-10% monetary threshold among users active in the last 30 days
    active_mask = rfm["recency_days"] <= 30
    monetary_active = rfm.loc[active_mask, "monetary_30d"]
    vip_threshold = float(monetary_active.quantile(0.90)) if not monetary_active.empty else float("inf")
    # Ensure threshold is meaningful (avoid VIP on zero-spend users)
    if vip_threshold <= 0:
        vip_threshold = float("inf")

    # FTD recency: "New" = first deposit within last 30 days
    ftd_col = "ftd_date" if "ftd_date" in rfm.columns else None

    def segment(row) -> str:
        recency = row["recency_days"]
        monetary = row["monetary_30d"]

        # New: FTD within last 30 days (takes priority over Active)
        if ftd_col:
            ftd_date = row.get(ftd_col)
            if pd.notna(ftd_date):
                ftd_recency_days = (as_of_date - pd.Timestamp(ftd_date).date()).days
                if ftd_recency_days <= 30:
                    return "New"

        if recency <= 30:
            if monetary >= vip_threshold:
                return "VIP"
            return "Active"
        if recency <= 90:
            return "At Risk"
        if recency <= 180:
            return "Lapsed"
        return "Dormant"

    rfm["segment"] = rfm.apply(segment, axis=1)

    # Clean columns
    cols_out = [
        "userid",
        "userstatus" if "userstatus" in rfm.columns else None,
        "last_login_dt",
        "last_sports_activity_dt",
        "last_casino_activity_dt",
        "last_activity_dt",
        "recency_days",
        "sessions_30d",
        "bets_30d",
        "casino_bets_30d",
        "total_product_events_30d",
        "frequency_30d",
        "frequency_basis",
        "settled_stake_30d",
        "settled_winnings_30d",
        "ggr_30d",
        "casino_stake_30d",
        "casino_winnings_30d",
        "casino_ggr_30d",
        "monetary_30d",
        "r_score",
        "f_score",
        "m_score",
        "rfm_score",
        "segment",
    ]
    cols_out = [c for c in cols_out if c is not None and c in rfm.columns]
    out = rfm[cols_out].copy()
    dedupe_order = [c for c in ["last_activity_dt", "last_login_dt", "rfm_score"] if c in out.columns]
    if dedupe_order:
        ascending = [True] * (len(dedupe_order) - 1) + [False]
        out = out.sort_values(dedupe_order, ascending=ascending)
    out = out.drop_duplicates(subset=["userid"], keep="last")
    return out.sort_values(["segment", "rfm_score"], ascending=[True, False])

