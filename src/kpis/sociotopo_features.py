"""
sociotopo_features.py
---------------------
Assembles per-user SocioTopography axis features from existing parquet data.

Three axes map each user to a point in a geometric state space:

  FC  (Financial Capacity)        – 0 = depleted  →  1 = healthy
  BIL (Behavioral Intensity/Load) – 0 = low load  →  1 = extreme
  OI  (Outcome Instability)       – 0 = stable    →  1 = chaotic

A composite risk_score is derived as:
  risk_score = (1 - fc_score)*0.40 + bil_score*0.30 + oi_score*0.30

Users near the (low FC, high BIL, high OI) corner of the state space are
approaching a "cliff" — conditions where a small additional shock tends to
trigger a disproportionate behavioural response (e.g. self-exclusion, churn,
large sudden withdrawal).

Data sources:
  REQUIRED  data/serving/rfm_users.parquet          – base user features
  REQUIRED  data/raw/betslips/*.parquet              – for OI + BIL time-series
  OPTIONAL  data/raw/users/*.parquet                 – for balance + account status
  OPTIONAL  data/raw/sessions/*.parquet              – for session gap (BIL)
  OPTIONAL  data/raw/bonus/*.parquet                 – for bonus reliance (OI)
  OPTIONAL  data/raw/user_transactions/*.parquet     – for net cashflow (FC)
  OPTIONAL  data/raw/selfexclusions/*.parquet        – for cliff ground-truth flag

Output:
  data/serving/sociotopo_features.parquet

Usage:
    python -m src.kpis.sociotopo_features
    python -m src.kpis.sociotopo_features --window 60
    python -m src.kpis.sociotopo_features --no-normalize   # raw scores only
"""
from __future__ import annotations

import argparse
import warnings
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from src.app_config import SERVING_ROOT, raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols, to_dt, to_num

# ── Output ────────────────────────────────────────────────────────────────────
OUT_FILE = SERVING_ROOT / "sociotopo_features.parquet"

# ── Axis weights for composite risk_score ─────────────────────────────────────
W_FC  = 0.40   # Financial Capacity   (inverted: lower FC → higher risk)
W_BIL = 0.30   # Behavioral Load
W_OI  = 0.30   # Outcome Instability

# ── Account status → risk weight mapping ──────────────────────────────────────
STATUS_RISK = {
    "enabled":       0.0,
    "be validated":  0.3,   # unverified account
    "disabled":      0.8,
    "frozen":        1.0,
}


# ══════════════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════════════

def _clip_and_scale(series: pd.Series) -> pd.Series:
    """Min-max scale after clipping to 1st–99th percentile."""
    clean = series.dropna()
    if clean.empty:
        return pd.Series(np.nan, index=series.index)
    lo = clean.quantile(0.01)
    hi = clean.quantile(0.99)
    if hi <= lo:
        return pd.Series(0.0, index=series.index)
    clipped = series.clip(lower=lo, upper=hi)
    return (clipped - lo) / (hi - lo)


def _max_losing_streak(is_losing: np.ndarray) -> int:
    """Longest consecutive run of True in a boolean array."""
    if len(is_losing) == 0:
        return 0
    padded = np.concatenate([[False], is_losing.astype(bool), [False]])
    diffs  = np.diff(padded.astype(int))
    starts = np.where(diffs ==  1)[0]
    ends   = np.where(diffs == -1)[0]
    if len(starts) == 0:
        return 0
    return int((ends - starts).max())


def _stake_escalation_ratio(daily_stakes: pd.Series) -> float:
    """
    Relative stake escalation: (mean of last half – mean of first half) / (mean of first half + 1).
    Positive → escalating; 0 → flat; negative → de-escalating.
    Requires at least 2 distinct days.
    """
    if len(daily_stakes) < 2:
        return 0.0
    mid   = len(daily_stakes) // 2
    first = daily_stakes.iloc[:mid].mean()
    last  = daily_stakes.iloc[mid:].mean()
    return float((last - first) / (first + 1.0))


# ══════════════════════════════════════════════════════════════════════════════
# Loaders
# ══════════════════════════════════════════════════════════════════════════════

def _load_rfm() -> pd.DataFrame:
    rfm_path = SERVING_ROOT / "rfm_users.parquet"
    if not rfm_path.exists():
        raise FileNotFoundError(
            f"RFM file not found at {rfm_path}. "
            "Run src/kpis/rfm_kpis.py (or build_daily_kpis) first."
        )
    df = pd.read_parquet(rfm_path)
    df["userid"] = df["userid"].astype("int64")
    return df


def _load_betslips(window_days: int, as_of: pd.Timestamp) -> pd.DataFrame:
    start = as_of - pd.Timedelta(days=window_days)
    df = read_all_parquets(raw_dir("betslips"), "betslips_*.parquet")
    if df.empty:
        return df
    df, col = normalize_cols(df)
    df["userid"]       = to_num(df[col["userid"]], np.nan).astype("Int64")
    df["placementdate"] = to_dt(df[col["placementdate"]])
    df["stake_num"]    = to_num(df[col["stake"]], 0.0)
    df["winnings_num"] = to_num(df[col["winnings"]], 0.0)
    df["outcometype"]  = df[col["outcometype"]].astype(str).str.strip()
    df["credittype"]   = df[col["credittype"]].astype(str).str.strip() if "credittype" in col else "User Account"
    # Restrict to the rolling window; exclude in-progress bets
    df = df[
        (df["placementdate"] >= start) &
        (df["placementdate"] <= as_of + pd.Timedelta(days=1)) &
        (~df["outcometype"].isin(["In Progress", "Cancelled", "nan"]))
    ].copy()
    return df


def _load_sessions(window_days: int, as_of: pd.Timestamp) -> pd.DataFrame:
    start = as_of - pd.Timedelta(days=window_days)
    df = read_all_parquets(raw_dir("sessions"), "sessions_*.parquet")
    if df.empty:
        return df
    df, col = normalize_cols(df)
    df["userid"]    = to_num(df[col["userid"]], np.nan).astype("Int64")
    df["logindate"] = to_dt(df[col["logindate"]])
    return df[
        (df["logindate"] >= start) &
        (df["logindate"] <= as_of + pd.Timedelta(days=1))
    ].copy()


def _load_users() -> pd.DataFrame:
    df = read_all_parquets(raw_dir("users"), "users_*.parquet")
    if df.empty:
        return df
    df, col = normalize_cols(df)
    df["userid"]     = to_num(df[col["userid"]], np.nan).astype("Int64")
    df["balance_raw"] = to_num(df.get(col.get("balance"), pd.Series(dtype=float)), 0.0)
    df["userstatus"] = (
        df[col["userstatus"]].astype(str).str.strip().str.lower()
        if "userstatus" in col else "enabled"
    )
    # Keep one row per user (latest by dateversion if available)
    order_col = col.get("dateversion") or col.get("lasttransactiondate")
    if order_col:
        df = df.sort_values(order_col).drop_duplicates("userid", keep="last")
    else:
        df = df.drop_duplicates("userid", keep="last")
    return df[["userid", "balance_raw", "userstatus"]].copy()


def _load_bonus(window_days: int, as_of: pd.Timestamp) -> pd.DataFrame:
    start = as_of - pd.Timedelta(days=window_days)
    df = read_all_parquets(raw_dir("bonus"), "bonus_*.parquet")
    if df.empty:
        return df
    df, col = normalize_cols(df)
    df["userid"]    = to_num(df[col["userid"]], np.nan).astype("Int64")
    df["amount_num"] = to_num(df[col["amount"]], 0.0)
    df["insertdate"] = to_dt(df.get(col.get("insertdate"), pd.Series(dtype="datetime64[ns]")))
    df["bonusstatus"] = df[col["bonusstatus"]].astype(str).str.strip() if "bonusstatus" in col else ""
    # Only credited bonuses in the window
    df = df[
        df["bonusstatus"].str.lower().isin(["credited"]) &
        (df["insertdate"] >= start) &
        (df["insertdate"] <= as_of + pd.Timedelta(days=1))
    ]
    bonus_agg = (
        df.groupby("userid")
        .agg(bonus_credited_30d=("amount_num", "sum"))
        .reset_index()
    )
    return bonus_agg


def _load_user_transactions(window_days: int, as_of: pd.Timestamp) -> Optional[pd.DataFrame]:
    """Returns None if user_transactions data hasn't been extracted yet."""
    folder = raw_dir("user_transactions")
    if not folder.exists() or not list(folder.glob("*.parquet")):
        return None
    start = as_of - pd.Timedelta(days=window_days)
    df = read_all_parquets(folder, "user_transactions_*.parquet")
    if df.empty:
        return None
    df, col = normalize_cols(df)
    df["userid"] = to_num(df[col["userid"]], np.nan).astype("Int64")
    df["date"]   = pd.to_datetime(df[col["date"]], errors="coerce")
    df["amount_num"] = to_num(df[col["amount"]], 0.0)
    df["tx_type"] = df[col["transaction_amount_type"]].astype(str).str.strip().str.lower() if "transaction_amount_type" in col else ""
    df = df[(df["date"] >= start) & (df["date"] <= as_of + pd.Timedelta(days=1))].copy()
    # Net cashflow: deposits positive, withdrawals negative
    # transaction_amount_type: 1=Debit (deposit to user), 2=Credit (withdrawal from user)
    # Treat type 1 as +amount, type 2 as -amount
    df["signed_amount"] = np.where(df["tx_type"] == "2", -df["amount_num"], df["amount_num"])
    agg = (
        df.groupby("userid")
        .agg(
            net_cashflow_30d=("signed_amount", "sum"),
            deposit_count_30d=("signed_amount", lambda x: (x > 0).sum()),
        )
        .reset_index()
    )
    return agg


def _load_selfexclusions() -> Optional[pd.DataFrame]:
    folder = raw_dir("selfexclusions")
    if not folder.exists() or not list(folder.glob("*.parquet")):
        return None
    df = read_all_parquets(folder, "selfexclusions_*.parquet")
    if df.empty:
        return None
    df, col = normalize_cols(df)
    if "userid" not in col:
        return None
    df["userid"] = to_num(df[col["userid"]], np.nan).astype("Int64")
    excl = df[["userid"]].drop_duplicates().copy()
    excl["self_exclusion_flag"] = 1
    return excl


# ══════════════════════════════════════════════════════════════════════════════
# Per-axis feature computation
# ══════════════════════════════════════════════════════════════════════════════

def _compute_betslip_features(betslips: pd.DataFrame) -> pd.DataFrame:
    """
    From settled betslips, compute per-user:
      - loss_rate_30d        : fraction of bets that are losing
      - max_losing_streak_30d: longest consecutive losing run (vectorised)
      - ggr_daily_cv         : coefficient of variation of daily GGR (volatility proxy)
      - stake_escalation     : relative escalation ratio (last half vs first half of window)
      - bonus_stake_ratio    : bonus-funded stake / total stake

    Fully vectorised — no Python-level user loop.
    """
    if betslips.empty:
        return pd.DataFrame(columns=[
            "userid", "loss_rate_30d", "max_losing_streak_30d",
            "ggr_daily_cv", "stake_escalation", "bonus_stake_ratio",
        ])

    bs = betslips.copy().sort_values(["userid", "placementdate"])
    bs["is_losing"]  = (bs["outcometype"].str.lower() == "losing").astype(int)
    bs["is_bonus"]   = bs["credittype"].str.lower().isin(["bonus", "freebets"])
    bs["ggr"]        = bs["stake_num"] - bs["winnings_num"]
    bs["bet_date"]   = bs["placementdate"].dt.floor("D")

    # ── Simple per-user aggregates ────────────────────────────────────────────
    simple = (
        bs.groupby("userid")
        .agg(
            loss_rate_30d   =("is_losing",   "mean"),
            bonus_stake_sum =("stake_num",   lambda x: bs.loc[x.index[bs.loc[x.index, "is_bonus"]], "stake_num"].sum()),
            total_stake_sum =("stake_num",   "sum"),
        )
        .reset_index()
    )
    # bonus ratio (simpler as separate groupby to avoid closure issues)
    bonus_stake = (
        bs[bs["is_bonus"]]
        .groupby("userid")["stake_num"].sum()
        .rename("bonus_stake")
        .reset_index()
    )
    total_stake = bs.groupby("userid")["stake_num"].sum().rename("total_stake").reset_index()
    stake_df = total_stake.merge(bonus_stake, on="userid", how="left").fillna(0)
    stake_df["bonus_stake_ratio"] = stake_df["bonus_stake"] / (stake_df["total_stake"] + 1e-6)

    # ── Daily GGR volatility ──────────────────────────────────────────────────
    daily = bs.groupby(["userid", "bet_date"])["ggr"].sum().reset_index()
    ggr_stats = (
        daily.groupby("userid")["ggr"]
        .agg(ggr_std="std", ggr_mean="mean", ggr_days="count")
        .reset_index()
    )
    ggr_stats["ggr_daily_cv"] = np.where(
        ggr_stats["ggr_days"] >= 2,
        ggr_stats["ggr_std"] / (ggr_stats["ggr_mean"].abs() + 1.0),
        0.0,
    )

    # ── Stake escalation: first-half vs second-half of window ─────────────────
    # Assign each bet a within-user ordinal rank (as fraction of window)
    bs["rank_frac"] = bs.groupby("userid")["placementdate"].rank(pct=True)
    first_half  = bs[bs["rank_frac"] <= 0.5].groupby("userid")["stake_num"].mean().rename("stake_first")
    second_half = bs[bs["rank_frac"] >  0.5].groupby("userid")["stake_num"].mean().rename("stake_last")
    esc = pd.concat([first_half, second_half], axis=1).reset_index()
    esc["stake_escalation"] = (esc["stake_last"] - esc["stake_first"]) / (esc["stake_first"] + 1.0)
    esc["stake_escalation"] = esc["stake_escalation"].fillna(0.0)

    # ── Max losing streak (vectorised via run-length encoding) ────────────────
    # Build a streak_id per user: increments whenever is_losing flips
    bs["streak_id"] = (bs["is_losing"] != bs.groupby("userid")["is_losing"].shift(0).where(
        bs["userid"] == bs["userid"].shift(1), other=bs["is_losing"]
    )).cumsum()
    # Recompute properly: streak breaks when value changes OR user changes
    user_changed   = bs["userid"] != bs["userid"].shift(1)
    value_changed  = bs["is_losing"] != bs["is_losing"].shift(1)
    bs["streak_id"] = (user_changed | value_changed).cumsum()
    streak_sizes = (
        bs[bs["is_losing"] == 1]
        .groupby(["userid", "streak_id"])
        .size()
        .reset_index(name="streak_len")
    )
    max_streaks = (
        streak_sizes.groupby("userid")["streak_len"]
        .max()
        .rename("max_losing_streak_30d")
        .reset_index()
    )

    # ── Assemble ──────────────────────────────────────────────────────────────
    result = (
        simple[["userid", "loss_rate_30d"]]
        .merge(stake_df[["userid", "bonus_stake_ratio"]], on="userid", how="left")
        .merge(ggr_stats[["userid", "ggr_daily_cv"]],    on="userid", how="left")
        .merge(esc[["userid", "stake_escalation"]],       on="userid", how="left")
        .merge(max_streaks,                               on="userid", how="left")
    )
    result["max_losing_streak_30d"] = result["max_losing_streak_30d"].fillna(0).astype(int)
    result["stake_escalation"]      = result["stake_escalation"].fillna(0.0)
    result["ggr_daily_cv"]          = result["ggr_daily_cv"].fillna(0.0)
    result["bonus_stake_ratio"]     = result["bonus_stake_ratio"].fillna(0.0)

    return result[["userid", "loss_rate_30d", "max_losing_streak_30d",
                   "ggr_daily_cv", "stake_escalation", "bonus_stake_ratio"]]


def _compute_session_features(sessions: pd.DataFrame) -> pd.DataFrame:
    """
    Mean hours between consecutive sessions per user (BIL proxy).
    Shorter gaps -> higher intensity load.  Fully vectorised.
    """
    if sessions.empty:
        return pd.DataFrame(columns=["userid", "mean_session_gap_hours"])

    ss = sessions.sort_values(["userid", "logindate"]).copy()
    # Compute gap only within the same user (NaN where user changes)
    ss["gap_hrs"] = ss["logindate"].diff().dt.total_seconds() / 3600
    ss.loc[ss["userid"] != ss["userid"].shift(1), "gap_hrs"] = np.nan
    agg = (
        ss.dropna(subset=["gap_hrs"])
        .groupby("userid")["gap_hrs"]
        .mean()
        .rename("mean_session_gap_hours")
        .reset_index()
    )
    return agg


# ══════════════════════════════════════════════════════════════════════════════
# Main build function
# ══════════════════════════════════════════════════════════════════════════════

def _detect_as_of() -> pd.Timestamp:
    """
    Infer the as_of date from the latest date found in betslips or RFM.
    Falls back to today if nothing is found.
    """
    candidates: list[pd.Timestamp] = []
    # Try betslips (most granular)
    bfiles = list(raw_dir("betslips").glob("*.parquet"))
    if bfiles:
        try:
            sample = pd.read_parquet(sorted(bfiles)[-1], columns=["PlacementDate"])
            dt = pd.to_datetime(sample["PlacementDate"], errors="coerce").max()
            if pd.notna(dt):
                candidates.append(dt)
        except Exception:
            pass
    # Try RFM last_activity
    rfm_path = SERVING_ROOT / "rfm_users.parquet"
    if rfm_path.exists():
        try:
            sample = pd.read_parquet(rfm_path, columns=["last_activity_dt"])
            dt = pd.to_datetime(sample["last_activity_dt"], errors="coerce").max()
            if pd.notna(dt):
                candidates.append(dt)
        except Exception:
            pass
    if candidates:
        return max(candidates).normalize()
    return pd.Timestamp.now().normalize()


def build_sociotopo_features(
    window_days: int = 30,
    as_of: Optional[pd.Timestamp] = None,
    normalize: bool = True,
) -> pd.DataFrame:
    if as_of is None:
        as_of = _detect_as_of()

    print(f"[sociotopo] Building features — window={window_days}d, as_of={as_of.date()}")

    # ── Load all sources ──────────────────────────────────────────────────────
    rfm         = _load_rfm()
    betslips    = _load_betslips(window_days, as_of)
    sessions    = _load_sessions(window_days, as_of)
    users_df    = _load_users()
    bonus_agg   = _load_bonus(window_days, as_of)
    tx_agg      = _load_user_transactions(window_days, as_of)
    excl_df     = _load_selfexclusions()

    print(f"[sociotopo] Sources — RFM:{len(rfm):,}  betslips:{len(betslips):,}  "
          f"sessions:{len(sessions):,}  users:{len(users_df):,}  "
          f"bonus:{len(bonus_agg):,}  "
          f"user_tx:{'yes' if tx_agg is not None else 'NOT YET EXTRACTED'}  "
          f"selfexcl:{'yes' if excl_df is not None else 'empty'}")

    # ── Derived per-user features ─────────────────────────────────────────────
    bs_feats   = _compute_betslip_features(betslips)
    sess_feats = _compute_session_features(sessions)

    # ── Assemble ──────────────────────────────────────────────────────────────
    feat = rfm[["userid", "recency_days", "sessions_30d", "bets_30d",
                "casino_bets_30d", "settled_stake_30d", "settled_winnings_30d",
                "ggr_30d", "monetary_30d", "segment"]].copy()

    # Users: balance + account status
    if not users_df.empty:
        feat = feat.merge(users_df, on="userid", how="left")
    else:
        feat["balance_raw"] = np.nan
        feat["userstatus"]  = "enabled"

    feat["balance_raw"]  = feat["balance_raw"].fillna(0.0)
    feat["userstatus"]   = feat["userstatus"].fillna("enabled")
    feat["status_risk"]  = feat["userstatus"].str.lower().map(STATUS_RISK).fillna(0.0)

    # Bonus
    if not bonus_agg.empty:
        feat = feat.merge(bonus_agg, on="userid", how="left")
    feat["bonus_credited_30d"] = feat.get("bonus_credited_30d", pd.Series(0.0, index=feat.index)).fillna(0.0)

    # User transactions (optional)
    if tx_agg is not None:
        feat = feat.merge(tx_agg, on="userid", how="left")
        feat["net_cashflow_30d"]  = feat["net_cashflow_30d"].fillna(0.0)
        feat["deposit_count_30d"] = feat["deposit_count_30d"].fillna(0.0)
    else:
        feat["net_cashflow_30d"]  = 0.0
        feat["deposit_count_30d"] = 0.0

    # Self-exclusions
    if excl_df is not None:
        feat = feat.merge(excl_df, on="userid", how="left")
    feat["self_exclusion_flag"] = feat.get("self_exclusion_flag", pd.Series(0, index=feat.index)).fillna(0).astype(int)

    # Betslip-derived features
    feat = feat.merge(bs_feats, on="userid", how="left")
    # Betslip features: users with no settled bets get neutral/conservative defaults
    bs_defaults = {
        "loss_rate_30d":         0.5,   # unknown → assume 50% loss rate
        "max_losing_streak_30d": 0.0,
        "ggr_daily_cv":          0.0,
        "stake_escalation":      0.0,
        "bonus_stake_ratio":     0.0,
    }
    for c, default in bs_defaults.items():
        median_val = feat[c].median()
        fill = median_val if pd.notna(median_val) else default
        feat[c] = feat[c].fillna(fill)

    # Session gap
    feat = feat.merge(sess_feats, on="userid", how="left")
    gap_q75 = feat["mean_session_gap_hours"].quantile(0.75)
    gap_fill = gap_q75 if pd.notna(gap_q75) else 24.0
    feat["mean_session_gap_hours"] = feat["mean_session_gap_hours"].fillna(gap_fill)

    # ── FC sub-features ───────────────────────────────────────────────────────
    # stake-to-balance leverage: how much of their current balance they're staking
    feat["stake_to_balance_ratio"] = feat["settled_stake_30d"] / (feat["balance_raw"].abs() + 1.0)

    # bonus dependency: bonus spend / total monetary activity
    feat["bonus_dependency_ratio"] = (
        feat["bonus_credited_30d"] /
        (feat["monetary_30d"] + feat["bonus_credited_30d"] + 1e-6)
    ).clip(0, 1)

    # ── Raw axis composites ───────────────────────────────────────────────────

    # FC raw (higher = healthier)
    feat["fc_raw"] = (
        np.log1p(feat["balance_raw"].clip(lower=0))       * 0.40 +
        np.log1p(feat["net_cashflow_30d"].clip(lower=0))  * 0.25 +
        (1 - feat["bonus_dependency_ratio"])               * 0.20 +
        (1 - feat["stake_to_balance_ratio"].clip(0, 1))   * 0.15
    )

    # BIL raw (higher = more load)
    # Invert session gap: shorter gap = higher load
    max_gap = feat["mean_session_gap_hours"].quantile(0.99)
    feat["session_gap_inv"] = 1 - (feat["mean_session_gap_hours"].clip(0, max_gap) / (max_gap + 1e-6))
    feat["bets_per_active_day"] = (
        (feat["bets_30d"] + feat["casino_bets_30d"]) /
        (feat["recency_days"].clip(1, window_days))   # active days proxy
    ).clip(lower=0)

    feat["bil_raw"] = (
        np.log1p(feat["sessions_30d"])         * 0.25 +
        np.log1p(feat["bets_per_active_day"])  * 0.25 +
        feat["stake_escalation"].clip(-1, 3)   * 0.25 +
        feat["session_gap_inv"]                * 0.25
    )

    # OI raw (higher = more unstable)
    feat["oi_raw"] = (
        feat["loss_rate_30d"]                     * 0.25 +
        np.log1p(feat["max_losing_streak_30d"])   * 0.20 +
        feat["ggr_daily_cv"].clip(0, 10)          * 0.15 +
        feat["bonus_stake_ratio"]                 * 0.10 +
        feat["status_risk"]                       * 0.20 +
        feat["self_exclusion_flag"].astype(float) * 0.10
    )

    # Normalize to 0-1
    if normalize:
        feat["fc_score"]  = _clip_and_scale(feat["fc_raw"])
        feat["bil_score"] = _clip_and_scale(feat["bil_raw"])
        feat["oi_score"]  = _clip_and_scale(feat["oi_raw"])
    else:
        feat["fc_score"]  = feat["fc_raw"]
        feat["bil_score"] = feat["bil_raw"]
        feat["oi_score"]  = feat["oi_raw"]

    # Composite risk score
    feat["risk_score"] = (
        (1 - feat["fc_score"])  * W_FC  +
        feat["bil_score"]       * W_BIL +
        feat["oi_score"]        * W_OI
    ).clip(0, 1)

    # Risk tier
    feat["risk_tier"] = pd.cut(
        feat["risk_score"],
        bins=[0, 0.30, 0.55, 0.75, 1.01],
        labels=["Low", "Moderate", "High", "Critical"],
        right=False,
    )

    # Output
    output_cols = [
        "userid", "segment",
        "balance_raw", "net_cashflow_30d", "deposit_count_30d",
        "bonus_dependency_ratio", "stake_to_balance_ratio",
        "sessions_30d", "bets_30d", "casino_bets_30d", "bets_per_active_day",
        "stake_escalation", "mean_session_gap_hours",
        "loss_rate_30d", "max_losing_streak_30d", "ggr_daily_cv",
        "bonus_stake_ratio", "status_risk", "self_exclusion_flag",
        "fc_score", "bil_score", "oi_score",
        "risk_score", "risk_tier",
        "fc_raw", "bil_raw", "oi_raw",
    ]
    output_cols = [c for c in output_cols if c in feat.columns]
    out = feat[output_cols].copy()
    out = out.sort_values("risk_score", ascending=False).reset_index(drop=True)
    return out


def main():
    p = argparse.ArgumentParser(description="Build SocioTopography axis features.")
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--no-normalize", dest="normalize", action="store_false")
    args = p.parse_args()
    SERVING_ROOT.mkdir(parents=True, exist_ok=True)
    features = build_sociotopo_features(window_days=args.window, normalize=args.normalize)
    features.to_parquet(OUT_FILE, index=False)
    n = len(features)
    msg = "[sociotopo] Saved {:,} users -> {}".format(n, OUT_FILE)
    print(msg)
    print("[sociotopo] Risk tier distribution:")
    print(features["risk_tier"].value_counts().sort_index().to_string())
    print("[sociotopo] Axis score summary:")
    print(features[["fc_score", "bil_score", "oi_score", "risk_score"]].describe().round(3).to_string())


if __name__ == "__main__":
    main()
