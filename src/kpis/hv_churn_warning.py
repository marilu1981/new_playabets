"""
hv_churn_warning.py
-------------------
Early warning model for high-value (HV) player churn.

Identifies HV players by 90-day total stake and scores them on churn
risk using trajectory features derived from existing parquet data.
No DWH connection required.

Warning score:
  recency_component   * 0.35   - days since last bet (normalised to churn_gap)
  stake_decline       * 0.25   - 7d avg stake vs 30d avg stake
  freq_decline        * 0.20   - 7d session count vs 30d session rate
  fc_depletion        * 0.10   - 1 - fc_score  (from sociotopo)
  oi_spike            * 0.10   - oi_score       (from sociotopo)

Warning tiers:
  Watch    0.30 - 0.50
  Alert    0.50 - 0.70
  Critical 0.70+

Data sources:
  REQUIRED  data/raw/betslips/*.parquet           - recency, stake trend, streaks
  OPTIONAL  data/raw/casino/*.parquet             - cross-product activity flag
  OPTIONAL  data/raw/balances/*.parquet           - current balance
  OPTIONAL  data/serving/sociotopo_features.parquet - FC / OI scores

Output:
  data/serving/hv_churn_warning.parquet

Usage:
    python -m src.kpis.hv_churn_warning
    python -m src.kpis.hv_churn_warning --hv-pct 0.05      # top 5% only
    python -m src.kpis.hv_churn_warning --churn-gap 14     # 14-day gap = churn
    python -m src.kpis.hv_churn_warning --window 60        # 60-day lookback
"""
from __future__ import annotations

import argparse
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

from src.app_config import SERVING_ROOT, raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols, to_dt, to_num

warnings.filterwarnings("ignore", category=FutureWarning)

# -- Output --------------------------------------------------------------------
OUT_FILE = SERVING_ROOT / "hv_churn_warning.parquet"

# -- Warning score weights -----------------------------------------------------
W_RECENCY      = 0.35
W_STAKE_DECL   = 0.25
W_FREQ_DECL    = 0.20
W_FC_DEPLETION = 0.10
W_OI_SPIKE     = 0.10


# ==============================================================================
# Data loaders
# ==============================================================================

def _load_betslips(window_days: int, as_of: pd.Timestamp) -> pd.DataFrame:
    folder = raw_dir("betslips")
    bs = read_all_parquets(folder, "*.parquet")
    if bs.empty:
        return bs

    bs, m = normalize_cols(bs)
    date_col   = m.get("placementdate") or m.get("settlementdate") or m.get("date")
    user_col   = m.get("userid")
    stake_col  = m.get("stake")
    win_col    = m.get("winnings") or m.get("win")

    if not date_col or not user_col:
        print("[hv_churn] betslips: missing date or userid column - skipping")
        return pd.DataFrame()

    bs["_dt"]     = to_dt(bs[date_col])
    bs["_userid"] = to_num(bs[user_col], default=np.nan)
    bs["_stake"]  = to_num(bs[stake_col], default=0.0) if stake_col else 0.0
    bs["_win"]    = to_num(bs[win_col],   default=0.0) if win_col   else 0.0

    cutoff = as_of - pd.Timedelta(days=window_days)
    bs = bs[(bs["_dt"] >= cutoff) & (bs["_dt"] <= as_of) & bs["_userid"].notna()]
    bs["_userid"] = bs["_userid"].astype(int)
    return bs[["_userid", "_dt", "_stake", "_win"]].copy()


def _load_casino(window_days: int, as_of: pd.Timestamp) -> pd.DataFrame:
    folder = raw_dir("casino")
    ca = read_all_parquets(folder, "*.parquet")
    if ca.empty:
        return ca

    ca, m = normalize_cols(ca)
    date_col = m.get("placementdate") or m.get("date")
    user_col = m.get("userid")

    if not date_col or not user_col:
        return pd.DataFrame()

    ca["_dt"]     = to_dt(ca[date_col])
    ca["_userid"] = to_num(ca[user_col], default=np.nan)

    cutoff = as_of - pd.Timedelta(days=window_days)
    ca = ca[(ca["_dt"] >= cutoff) & (ca["_dt"] <= as_of) & ca["_userid"].notna()]
    ca["_userid"] = ca["_userid"].astype(int)
    return ca[["_userid", "_dt"]].copy()


def _load_balances() -> pd.DataFrame:
    folder = raw_dir("balances")
    bal = read_all_parquets(folder, "*.parquet")
    if bal.empty:
        return bal

    bal, m = normalize_cols(bal)
    user_col    = m.get("userid")
    balance_col = m.get("balance") or m.get("currentbalance") or m.get("availablebalance")

    if not user_col or not balance_col:
        return pd.DataFrame()

    bal["_userid"]   = to_num(bal[user_col],    default=np.nan)
    bal["_balance"]  = to_num(bal[balance_col], default=0.0)
    bal = bal.dropna(subset=["_userid"])
    bal["_userid"] = bal["_userid"].astype(int)

    # Keep latest balance per user (balances is a full-refresh snapshot)
    return bal.groupby("_userid")[["_balance"]].last().reset_index()


def _load_sociotopo() -> pd.DataFrame:
    path = SERVING_ROOT / "sociotopo_features.parquet"
    if not path.exists():
        print("[hv_churn] sociotopo_features.parquet not found - FC/OI will default to 0.5")
        return pd.DataFrame()

    st = pd.read_parquet(path)
    st, m = normalize_cols(st)
    user_col = m.get("userid")
    fc_col   = m.get("fc_score")
    oi_col   = m.get("oi_score")

    if not user_col:
        return pd.DataFrame()

    st["_userid"] = to_num(st[user_col], default=np.nan).astype("Int64")
    out = pd.DataFrame({"_userid": st["_userid"]})
    out["fc_score"] = to_num(st[fc_col], default=0.5) if fc_col else 0.5
    out["oi_score"] = to_num(st[oi_col], default=0.5) if oi_col else 0.5
    return out.dropna(subset=["_userid"])


# ==============================================================================
# Feature engineering
# ==============================================================================

def _detect_as_of(bs: pd.DataFrame) -> pd.Timestamp:
    if not bs.empty and "_dt" in bs.columns:
        return bs["_dt"].max()
    return pd.Timestamp.now().normalize()


def _betslip_features(bs: pd.DataFrame, as_of: pd.Timestamp,
                      window_days: int, churn_gap_days: int) -> pd.DataFrame:
    """
    Per-user: recency, stake trend (7d vs 30d), session frequency trend,
    losing streak in last 14 days, total stake in full window.
    """
    if bs.empty:
        return pd.DataFrame()

    now = as_of

    # -- Recency ---------------------------------------------------------------
    last_bet = bs.groupby("_userid")["_dt"].max().rename("last_bet_dt")

    # -- Total stake (full window) - used for HV ranking ----------------------
    total_stake = bs.groupby("_userid")["_stake"].sum().rename("total_stake_window")

    # -- Stake trend: avg stake in last 7d vs avg stake in last 30d -----------
    cut7  = now - pd.Timedelta(days=7)
    cut30 = now - pd.Timedelta(days=30)

    stake7  = (bs[bs["_dt"] >= cut7]
               .groupby("_userid")["_stake"].mean().rename("avg_stake_7d"))
    stake30 = (bs[bs["_dt"] >= cut30]
               .groupby("_userid")["_stake"].mean().rename("avg_stake_30d"))

    # -- Session frequency: bet-days in last 7d vs daily rate in last 30d ------
    def _bet_days(mask):
        return (bs[mask]
                .assign(_date=bs["_dt"].dt.date)
                .groupby("_userid")["_date"].nunique())

    freq7d = _bet_days(bs["_dt"] >= cut7).rename("bet_days_7d")
    freq30d = _bet_days(bs["_dt"] >= cut30).rename("bet_days_30d")

    # -- Losing streak in last 14d ---------------------------------------------
    cut14 = now - pd.Timedelta(days=14)
    recent = bs[bs["_dt"] >= cut14].copy()
    if not recent.empty:
        recent = recent.sort_values(["_userid", "_dt"])
        recent["_is_loss"] = (recent["_win"] < recent["_stake"]).astype(int)
        user_changed  = recent["_userid"] != recent["_userid"].shift(1)
        value_changed = recent["_is_loss"] != recent["_is_loss"].shift(1)
        recent["_streak_id"] = (user_changed | value_changed).cumsum()
        streak_len = (recent.groupby(["_userid", "_streak_id", "_is_loss"])
                      .size().reset_index(name="_n"))
        # Only losing streaks (is_loss == 1), take max per user
        losing = streak_len[streak_len["_is_loss"] == 1]
        max_streak = losing.groupby("_userid")["_n"].max().rename("losing_streak_14d")
    else:
        max_streak = pd.Series(dtype=float, name="losing_streak_14d")

    # -- Assemble --------------------------------------------------------------
    out = (pd.concat([last_bet, total_stake, stake7, stake30,
                      freq7d, freq30d, max_streak], axis=1)
           .reset_index()
           .rename(columns={"_userid": "userid"}))

    out["days_since_last_bet"] = (now - out["last_bet_dt"]).dt.total_seconds() / 86400
    out["days_since_last_bet"] = out["days_since_last_bet"].clip(lower=0)

    # Stake trend ratio: 7d avg / 30d avg  (>1 = escalating, <1 = declining)
    out["stake_trend_7v30"] = (
        out["avg_stake_7d"].fillna(0) /
        out["avg_stake_30d"].replace(0, np.nan)
    ).fillna(0).clip(upper=5)

    # Freq trend ratio: 7d bet-days / (30d bet-days / 30 * 7)  - normalised to same window
    expected_7d = (out["bet_days_30d"].fillna(0) / 30 * 7).replace(0, np.nan)
    out["freq_trend_7v30"] = (out["bet_days_7d"].fillna(0) / expected_7d).fillna(0).clip(upper=5)

    out["losing_streak_14d"] = out["losing_streak_14d"].fillna(0)

    return out


def _casino_flag(ca: pd.DataFrame, as_of: pd.Timestamp) -> pd.Series:
    """Flag users active on casino in last 7 days."""
    if ca.empty:
        return pd.Series(dtype=int, name="casino_active_7d")
    cut7 = as_of - pd.Timedelta(days=7)
    active = (ca[ca["_dt"] >= cut7]
              .groupby("_userid")["_dt"].count()
              .gt(0).astype(int)
              .rename("casino_active_7d"))
    return active


# ==============================================================================
# Warning score
# ==============================================================================

def _compute_warning_score(df: pd.DataFrame, churn_gap_days: int) -> pd.DataFrame:
    out = df.copy()

    # Recency component: 0 = bet today, 1 = gone for churn_gap_days+
    out["_recency"] = (out["days_since_last_bet"] / churn_gap_days).clip(0, 1)

    # Stake decline: 0 = stable/growing, 1 = no recent bets vs historical
    out["_stake_decl"] = (1 - out["stake_trend_7v30"].fillna(0)).clip(0, 1)

    # Freq decline: 0 = stable, 1 = silent
    out["_freq_decl"] = (1 - out["freq_trend_7v30"].fillna(0)).clip(0, 1)

    # FC depletion and OI spike from sociotopo (default 0.5 if missing)
    fc = out.get("fc_score", pd.Series(0.5, index=out.index)).fillna(0.5)
    oi = out.get("oi_score", pd.Series(0.5, index=out.index)).fillna(0.5)
    out["_fc_depletion"] = (1 - fc).clip(0, 1)
    out["_oi_spike"]     = oi.clip(0, 1)

    out["warning_score"] = (
        W_RECENCY      * out["_recency"]      +
        W_STAKE_DECL   * out["_stake_decl"]   +
        W_FREQ_DECL    * out["_freq_decl"]    +
        W_FC_DEPLETION * out["_fc_depletion"] +
        W_OI_SPIKE     * out["_oi_spike"]
    ).round(4)

    out["warning_tier"] = pd.cut(
        out["warning_score"],
        bins=[0, 0.30, 0.50, 0.70, 1.01],
        labels=["Safe", "Watch", "Alert", "Critical"],
        right=False,
    )

    # Priority score: warning probability x value rank within HV cohort
    # Ranks total_stake_window 0->1 within the HV subset so high-stake silent
    # players surface above low-stake silent ones.
    stake_rank = out["total_stake_window"].rank(pct=True)
    out["priority_score"] = (out["warning_score"] * stake_rank).round(4)

    # Drop internal computation columns
    out = out.drop(columns=[c for c in out.columns if c.startswith("_")])
    return out


# ==============================================================================
# Main builder
# ==============================================================================

def build_hv_churn_warning(
    hv_pct: float = 0.10,
    window_days: int = 90,
    churn_gap_days: int = 21,
) -> pd.DataFrame:
    """
    Build the HV churn warning table.

    Parameters
    ----------
    hv_pct : float
        Top fraction of users by total stake considered high-value (default 10%).
    window_days : int
        Lookback window in days for feature computation (default 90).
    churn_gap_days : int
        Days of silence that constitute churn (default 21).

    Returns
    -------
    pd.DataFrame with one row per HV user, sorted by warning_score descending.
    """
    print("[hv_churn] Loading betslips...")
    bs = _load_betslips(window_days, pd.Timestamp.now())

    if bs.empty:
        print("[hv_churn] No betslip data found - cannot proceed.")
        return pd.DataFrame()

    as_of = _detect_as_of(bs)
    # Re-load with correct as_of (in case data ends before today)
    bs = _load_betslips(window_days, as_of)
    print(f"[hv_churn] as_of={as_of.date()}  betslip rows={len(bs):,}")

    print("[hv_churn] Computing betslip features...")
    feat = _betslip_features(bs, as_of, window_days, churn_gap_days)

    # -- HV classification -----------------------------------------------------
    stake_threshold = feat["total_stake_window"].quantile(1 - hv_pct)
    feat["is_hv"] = feat["total_stake_window"] >= stake_threshold
    feat["hv_rank_pct"] = feat["total_stake_window"].rank(pct=True).round(4)

    hv = feat[feat["is_hv"]].copy()
    n_hv = len(hv)
    print(f"[hv_churn] HV players (top {hv_pct:.0%}): {n_hv:,}  "
          f"(stake threshold: R {stake_threshold:,.0f})")

    # -- Casino cross-product flag ---------------------------------------------
    print("[hv_churn] Loading casino data...")
    ca = _load_casino(window_days, as_of)
    casino_flag = _casino_flag(ca, as_of)
    hv = hv.merge(casino_flag.reset_index().rename(columns={"_userid": "userid"}),
                  on="userid", how="left")
    hv["casino_active_7d"] = hv["casino_active_7d"].fillna(0).astype(int)

    # -- Balance ---------------------------------------------------------------
    print("[hv_churn] Loading balances...")
    bal = _load_balances()
    if not bal.empty:
        hv = hv.merge(bal.rename(columns={"_userid": "userid", "_balance": "current_balance"}),
                      on="userid", how="left")
        hv["current_balance"] = hv["current_balance"].fillna(0.0)
    else:
        hv["current_balance"] = np.nan

    # -- SocioTopo scores ------------------------------------------------------
    print("[hv_churn] Loading sociotopo scores...")
    st = _load_sociotopo()
    if not st.empty:
        hv = hv.merge(st.rename(columns={"_userid": "userid"}),
                      on="userid", how="left")
    else:
        hv["fc_score"] = 0.5
        hv["oi_score"] = 0.5

    hv["fc_score"] = hv["fc_score"].fillna(0.5)
    hv["oi_score"] = hv["oi_score"].fillna(0.5)

    # -- Warning score ---------------------------------------------------------
    print("[hv_churn] Computing warning scores...")
    hv = _compute_warning_score(hv, churn_gap_days)

    # -- Sort and select output columns ----------------------------------------
    output_cols = [
        "userid",
        "hv_rank_pct",
        "total_stake_window",
        "days_since_last_bet",
        "last_bet_dt",
        "avg_stake_7d",
        "avg_stake_30d",
        "stake_trend_7v30",
        "bet_days_7d",
        "bet_days_30d",
        "freq_trend_7v30",
        "losing_streak_14d",
        "casino_active_7d",
        "current_balance",
        "fc_score",
        "oi_score",
        "warning_score",
        "warning_tier",
        "priority_score",
    ]
    output_cols = [c for c in output_cols if c in hv.columns]
    hv = hv[output_cols].sort_values("priority_score", ascending=False).reset_index(drop=True)

    return hv


# ==============================================================================
# CLI entry point
# ==============================================================================

def main() -> None:
    p = argparse.ArgumentParser(description="HV player churn early warning")
    p.add_argument("--hv-pct",      type=float, default=0.10,
                   help="Top fraction of users by stake considered HV (default 0.10 = top 10%%)")
    p.add_argument("--churn-gap",   type=int,   default=21,
                   help="Days of silence = churn (default 21)")
    p.add_argument("--window",      type=int,   default=90,
                   help="Lookback window in days (default 90)")
    args = p.parse_args()

    SERVING_ROOT.mkdir(parents=True, exist_ok=True)
    result = build_hv_churn_warning(
        hv_pct=args.hv_pct,
        window_days=args.window,
        churn_gap_days=args.churn_gap,
    )

    if result.empty:
        print("[hv_churn] No output produced.")
        return

    result.to_parquet(OUT_FILE, index=False)
    print(f"\n[hv_churn] Saved {len(result):,} HV users -> {OUT_FILE}")
    print("\n[hv_churn] Warning tier distribution:")
    print(result["warning_tier"].value_counts().sort_index().to_string())
    print("\n[hv_churn] Top 10 priority HV players (by priority_score):")
    print(result[["userid", "total_stake_window", "days_since_last_bet",
                  "warning_score", "priority_score", "warning_tier"]]
          .head(10).to_string(index=False))


if __name__ == "__main__":
    main()
