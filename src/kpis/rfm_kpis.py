from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
import pandas as pd

from .io_utils import normalize_cols, ensure_cols, to_dt, to_date, to_num


@dataclass(frozen=True)
class RFMWindow:
    days: int = 30   # rolling window length for F and M
    recency_cap_days: int = 365  # cap recency to avoid huge outliers


def _score_quantiles(series: pd.Series, ascending: bool, labels=(1, 2, 3, 4, 5)) -> pd.Series:
    """
    Return 1..5 score based on quintiles.
    For recency: smaller is better => ascending=True.
    For frequency/monetary: larger is better => ascending=False.
    """
    s = series.copy()
    # handle constant/empty
    if s.nunique(dropna=True) <= 1:
        return pd.Series([3] * len(s), index=s.index, dtype=int)

    # rank first to reduce ties issues
    ranks = s.rank(method="first", ascending=ascending)
    try:
        return pd.qcut(ranks, 5, labels=labels).astype(int)
    except ValueError:
        # if qcut fails due to duplicates, fallback to cut on ranks
        return pd.cut(ranks, bins=5, labels=labels, include_lowest=True).astype(int)


def build_rfm_users(
    users: pd.DataFrame,
    betslips: pd.DataFrame,
    sessions: Optional[pd.DataFrame],
    as_of: Optional[pd.Timestamp] = None,
    window: RFMWindow = RFMWindow(),
) -> pd.DataFrame:
    """
    Returns per-user RFM table.

    Inputs expected:
    - users: contains userid (+ optional userstatus, testuser)
    - betslips: contains userid, placementdate, paymentdate, stake, winnings, betslipstatus
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

    if cols_to_add:
        add_df = users[[uid_u] + cols_to_add].drop_duplicates().copy()
        add_df = add_df.rename(columns={uid_u: "userid"})
        base = base.merge(add_df, on="userid", how="left")

    # filter test users if present
    if test_col and test_col in base.columns:
        base = base[base[test_col].fillna(0).astype(int) == 0]

    # rename status to consistent name
    if status_col and status_col in base.columns:
        base = base.rename(columns={status_col: "userstatus"})

    # --- Betslips: betting frequency + monetary (GGR)
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

    # choose settlement date when possible for monetary truth; else placementdate
    if payment_c:
        bs["bs_dt"] = to_dt(bs[payment_c])
    elif placement_c:
        bs["bs_dt"] = to_dt(bs[placement_c])
    else:
        bs["bs_dt"] = pd.NaT

    # filter to rolling window
    bs_win = bs[(bs["bs_dt"].notna()) & (bs["bs_dt"] >= pd.Timestamp(start_dt)) & (bs["bs_dt"] <= as_of + pd.Timedelta(days=1))]

    # If we can identify settled only, use that for monetary
    if status_b:
        settled_mask = bs_win[status_b].astype(str).eq("Paid - Closed")
        bs_settled = bs_win[settled_mask].copy()
    else:
        bs_settled = bs_win.copy()

    bs_settled["ggr"] = bs_settled["stake_num"] - bs_settled["winnings_num"]

    bs_win["bs_day"] = bs_win["bs_dt"].dt.floor("D")


    betting_agg = (
        bs_win.groupby("userid")
        .agg(
            bets_30d=("userid", "size"),
            active_bet_days_30d=("bs_day", "nunique"),
            stake_30d=("stake_num", "sum"),
        )
        .reset_index()
    )

    monetary_agg = (
        bs_settled.groupby("userid")
        .agg(
            settled_stake_30d=("stake_num", "sum"),
            settled_winnings_30d=("winnings_num", "sum"),
            ggr_30d=("ggr", "sum"),
        )
        .reset_index()
    )
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
        last_login = pd.DataFrame(columns=["userid", "last_login_dt"])
        # login_freq = pd.DataFrame(columns=["userid", "sessions_30d", "active_login_days_30d"])

    # --- Merge into RFM user table
    rfm = base.merge(last_login, on="userid", how="left")
    rfm = rfm.merge(login_freq, on="userid", how="left")
    rfm = rfm.merge(betting_agg, on="userid", how="left")
    rfm = rfm.merge(monetary_agg, on="userid", how="left")

    for c in ["sessions_30d", "active_login_days_30d", "bets_30d", "active_bet_days_30d"]:
        if c in rfm.columns:
            rfm[c] = rfm[c].fillna(0).astype(int)
    for c in ["stake_30d", "settled_stake_30d", "settled_winnings_30d", "ggr_30d"]:
        if c in rfm.columns:
            rfm[c] = rfm[c].fillna(0.0).astype(float)

    # Recency days
    rfm["recency_days"] = rfm["last_login_dt"].apply(
        lambda d: (as_of_date - d.date()).days if pd.notna(d) else window.recency_cap_days
    )
    rfm["recency_days"] = rfm["recency_days"].clip(lower=0, upper=window.recency_cap_days).astype(int)

    # Choose Frequency for scoring:
    # - use sessions_30d if available, else bets_30d
    if "sessions_30d" in rfm.columns and rfm["sessions_30d"].sum() > 0:
        rfm["frequency_30d"] = rfm["sessions_30d"]
        rfm["frequency_basis"] = "sessions"
    else:
        rfm["frequency_30d"] = rfm["bets_30d"].fillna(0).astype(int)
        rfm["frequency_basis"] = "bets"

    # Monetary for scoring: ggr_30d (can be negative); use abs or ggr?
    # For sportsbook, "value" often better as settled_stake_30d or max(ggr,0).
    rfm["monetary_30d"] = rfm["settled_stake_30d"].fillna(0.0).astype(float)

    # Scores
    rfm["r_score"] = _score_quantiles(rfm["recency_days"], ascending=True)
    rfm["f_score"] = _score_quantiles(rfm["frequency_30d"], ascending=False)
    rfm["m_score"] = _score_quantiles(rfm["monetary_30d"], ascending=False)

    rfm["rfm_score"] = rfm["r_score"] * 100 + rfm["f_score"] * 10 + rfm["m_score"]

    # Segment rules:
    # 1) Champions: R=5, F=5, M=5
    # 2) Big Spenders: not Champion AND F>=4 AND M=5
    # 3) Loyal: not Champion/Big Spender AND R>=4 AND F>=4 AND M>=3
    # 4) At Risk / Dormant / Mid unchanged
    def segment(row) -> str:
        r, f, m = row["r_score"], row["f_score"], row["m_score"]
        is_champion = (r == 5 and f == 5 and m == 5)
        if is_champion:
            return "Champions"

        is_big_spender = (f >= 4 and m == 5)
        if is_big_spender:
            return "Big Spenders"

        is_loyal = (r >= 4 and f >= 4 and m >= 3)
        if is_loyal:
            return "Loyal"

        if r <= 2 and f >= 3:
            return "At Risk"
        if r <= 2 and f <= 2:
            return "Dormant"
        return "Mid"

    rfm["segment"] = rfm.apply(segment, axis=1)

    # Clean columns
    cols_out = [
        "userid",
        "userstatus" if "userstatus" in rfm.columns else None,
        "last_login_dt",
        "recency_days",
        "sessions_30d",
        "bets_30d",
        "frequency_30d",
        "frequency_basis",
        "settled_stake_30d",
        "settled_winnings_30d",
        "ggr_30d",
        "monetary_30d",
        "r_score",
        "f_score",
        "m_score",
        "rfm_score",
        "segment",
    ]
    cols_out = [c for c in cols_out if c is not None and c in rfm.columns]

    return rfm[cols_out].sort_values(["segment", "rfm_score"], ascending=[True, False])

