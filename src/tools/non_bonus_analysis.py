"""
non_bonus_analysis.py
---------------------
Companion to bonus_analysis.py — analyses players who were NEVER issued a bonus
in the selected window, providing a baseline for comparison.

Funnel (overall and per-player):
    All players in turnover data
      -> exclude anyone with a Credited bonus in the window
      -> Turnover / GGR (real-money bets only)
      -> FTD flag (did they make a first deposit in the window?)
      -> Net Value proxy = GGR  (no bonus cost to subtract)

Also identifies:
    - High-value non-bonus players (top quartile GGR)
    - Players who deposited (FTD) but never bet (low engagement)

DATA NOTES / ASSUMPTIONS:
    - Non-bonus = no BonusStatus == "Credited" row in the window for that player.
    - Real-money turnover only: sports CreditType == "User Account", casino Stake > 0.
    - Deposits/withdrawals are stored as DAILY AGGREGATES — no per-user deposit amounts.
    - Net Value is GGR only (no bonus cost, no per-user withdrawal data).

Usage (on the VM, full data):
    python -m src.tools.non_bonus_analysis --start 2026-01-01 --outdir data/serving/non_bonus_analysis
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from src.app_config import raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols, to_dt, to_num


ISSUED_STATUS = "Credited"


def _load_bonused_userids(start: pd.Timestamp, end: pd.Timestamp) -> set[int]:
    """Return the set of userids who received at least one Credited bonus in the window."""
    raw = read_all_parquets(raw_dir("bonus"), "bonuses_increment*.parquet")
    if raw.empty:
        return set()
    df, m = normalize_cols(raw)
    uid = m.get("userid")
    status = m.get("bonusstatus")
    dcol = m.get("insertdate")
    if not uid or not status or not dcol:
        return set()
    df["userid"] = to_num(df[uid], default=np.nan)
    df["bonus_status"] = df[status].astype(str)
    df["insert_date"] = to_dt(df[dcol])
    df = df.dropna(subset=["userid", "insert_date"])
    df = df[(df["insert_date"] >= start) & (df["insert_date"] <= end)]
    issued = df[df["bonus_status"] == ISSUED_STATUS]
    return set(issued["userid"].dropna().astype(int).tolist())


def _load_turnover(start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    frames = []
    bs_raw = read_all_parquets(raw_dir("betslips"), "betslips*.parquet")
    if not bs_raw.empty:
        bs, m = normalize_cols(bs_raw)
        uid, dcol, stake, win, credit = (m.get("userid"), m.get("placementdate"),
            m.get("stake"), m.get("winnings"), m.get("credittype"))
        bs["userid"] = to_num(bs[uid], default=np.nan)
        bs["_dt"] = to_dt(bs[dcol])
        bs["stake"] = to_num(bs[stake], default=0.0)
        bs["win"] = to_num(bs[win], default=0.0)
        bs["credit_type"] = bs[credit].astype(str) if credit else "User Account"
        bs = bs.dropna(subset=["userid", "_dt"])
        bs = bs[(bs["_dt"] >= start) & (bs["_dt"] <= end)]
        bs["userid"] = bs["userid"].astype(int)
        frames.append(bs[["userid", "_dt", "stake", "win", "credit_type"]].assign(product="sports"))

    ca_raw = read_all_parquets(raw_dir("casino"), "*.parquet")
    if not ca_raw.empty:
        ca, m = normalize_cols(ca_raw)
        uid, dcol, stake, win = m.get("userid"), m.get("placementdate"), m.get("stake"), m.get("winnings")
        ca["userid"] = to_num(ca[uid], default=np.nan)
        ca["_dt"] = to_dt(ca[dcol])
        ca["stake"] = to_num(ca[stake], default=0.0)
        ca["win"] = to_num(ca[win], default=0.0)
        ca = ca[ca["stake"] > 0]
        ca = ca.dropna(subset=["userid", "_dt"])
        ca = ca[(ca["_dt"] >= start) & (ca["_dt"] <= end)]
        ca["userid"] = ca["userid"].astype(int)
        ca["credit_type"] = "User Account"
        frames.append(ca[["userid", "_dt", "stake", "win", "credit_type"]].assign(product="casino"))

    if not frames:
        return pd.DataFrame(columns=["userid", "_dt", "stake", "win", "credit_type", "product"])
    return pd.concat(frames, ignore_index=True)


def _load_ftd(start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    raw = read_all_parquets(raw_dir("first_deposits"), "*.parquet")
    if raw.empty:
        return pd.DataFrame(columns=["userid", "ftd_date"])
    df, m = normalize_cols(raw)
    uid = m.get("idutente") or m.get("userid")
    dcol = m.get("dataprimodeposito") or m.get("ftd_date")
    if not uid or not dcol:
        return pd.DataFrame(columns=["userid", "ftd_date"])
    out = pd.DataFrame({"userid": to_num(df[uid], default=np.nan), "ftd_date": to_dt(df[dcol])})
    out = out.dropna(subset=["userid"])
    out["userid"] = out["userid"].astype(int)
    out = out.sort_values("ftd_date").drop_duplicates("userid", keep="first")
    return out


def main() -> None:
    p = argparse.ArgumentParser(description="Non-bonus player analysis — baseline comparison")
    p.add_argument("--start", default="2026-01-01", help="Start date YYYY-MM-DD")
    p.add_argument("--end", default=None, help="End date YYYY-MM-DD (default: today)")
    p.add_argument("--outdir", default="data/serving/non_bonus_analysis", help="Output directory for CSVs")
    p.add_argument("--high-value-quantile", type=float, default=0.75,
                   help="GGR quantile threshold to flag high-value players (default 0.75)")
    args = p.parse_args()

    start = pd.Timestamp(args.start)
    end = pd.Timestamp(args.end) if args.end else pd.Timestamp.now().normalize() + pd.Timedelta(days=1)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"[non_bonus] window {start.date()} -> {end.date()}")

    bonused_ids = _load_bonused_userids(start, end)
    print(f"[non_bonus] excluding {len(bonused_ids):,} players who received a bonus")

    turnover = _load_turnover(start, end)
    ftd = _load_ftd(start, end)

    # ---- filter to real-money, non-bonused players ----
    real = turnover[turnover["credit_type"] == "User Account"].copy() if not turnover.empty else turnover
    real = real[~real["userid"].isin(bonused_ids)]

    if real.empty:
        print("[non_bonus] no real-money turnover for non-bonus players in this window.")
        return

    # ---- per-player turnover/GGR ----
    per_user = real.groupby("userid").agg(
        turnover=("stake", "sum"),
        winnings=("win", "sum"),
        bets=("stake", "size"),
        sports_bets=("stake", lambda x: (real.loc[x.index, "product"] == "sports").sum()),
        casino_bets=("stake", lambda x: (real.loc[x.index, "product"] == "casino").sum()),
    ).reset_index()
    per_user["ggr"] = per_user["turnover"] - per_user["winnings"]

    # ---- merge FTD (window-scoped: only FTDs that occurred within the analysis window) ----
    ftd_nb = ftd[~ftd["userid"].isin(bonused_ids)]
    ftd_nb_window = ftd_nb[(ftd_nb["ftd_date"] >= start) & (ftd_nb["ftd_date"] <= end)]
    player = per_user.merge(ftd_nb_window.assign(got_ftd=1)[["userid", "ftd_date", "got_ftd"]], on="userid", how="left")
    player["got_ftd"] = player["got_ftd"].fillna(0).astype(int)
    player = player.sort_values("ggr", ascending=False)
    player.to_csv(outdir / "01_player_funnel.csv", index=False)
    print(f"[non_bonus] 01_player_funnel: {len(player):,} players")

    # ---- high-value non-bonus players ----
    if len(player) > 4:
        ggr_threshold = player["ggr"].quantile(args.high_value_quantile)
    else:
        ggr_threshold = player["ggr"].median()
    high_value = player[player["ggr"] >= ggr_threshold].sort_values("ggr", ascending=False)
    high_value.to_csv(outdir / "02_high_value_players.csv", index=False)
    print(f"[non_bonus] 02_high_value_players: {len(high_value):,} players (GGR >= R{ggr_threshold:,.0f})")

    # ---- FTD players (within window) with no bets — genuinely deposited and didn't engage ----
    ftd_no_bet_ids = set(ftd_nb_window["userid"]) - set(per_user["userid"])
    ftd_no_bet = ftd_nb_window[ftd_nb_window["userid"].isin(ftd_no_bet_ids)].copy()
    ftd_no_bet.to_csv(outdir / "03_ftd_no_bets.csv", index=False)
    print(f"[non_bonus] 03_ftd_no_bets: {len(ftd_no_bet):,} players deposited in window but never bet")

    # ---- product split: sports-only / casino-only / both ----
    player["has_sports"] = player["sports_bets"] > 0
    player["has_casino"] = player["casino_bets"] > 0
    product_split = player.groupby(["has_sports", "has_casino"]).agg(
        players=("userid", "count"),
        total_turnover=("turnover", "sum"),
        total_ggr=("ggr", "sum"),
    ).reset_index()
    product_split["segment"] = product_split.apply(
        lambda r: "both" if r["has_sports"] and r["has_casino"]
                  else ("sports_only" if r["has_sports"] else "casino_only"), axis=1
    )
    product_split = product_split[["segment", "players", "total_turnover", "total_ggr"]]
    product_split.to_csv(outdir / "04_product_split.csv", index=False)

    # ---- overall summary ----
    summary = pd.DataFrame([{
        "window_start": start.date(),
        "window_end": (end - pd.Timedelta(days=1)).date(),
        "bonused_players_excluded": len(bonused_ids),
        "non_bonus_players_with_turnover": len(player),
        "non_bonus_players_with_ftd_in_window": int(player["got_ftd"].sum()),
        "ftd_players_never_bet": len(ftd_no_bet),
        "total_turnover": round(real["stake"].sum(), 2),
        "total_ggr": round(per_user["ggr"].sum(), 2),
        "avg_ggr_per_player": round(per_user["ggr"].mean(), 2),
        "median_ggr_per_player": round(per_user["ggr"].median(), 2),
        "high_value_player_count": len(high_value),
        "high_value_ggr_threshold": round(ggr_threshold, 2),
        "NOTE": "net value = GGR only (no bonus cost); no per-user deposit/withdrawal amounts available",
    }])
    summary.to_csv(outdir / "05_funnel_summary.csv", index=False)

    print("\n=== NON-BONUS PLAYER FUNNEL SUMMARY ===")
    for k, v in summary.iloc[0].items():
        print(f"  {k}: {v}")
    print(f"\n[non_bonus] wrote 5 CSVs -> {outdir}/")


if __name__ == "__main__":
    main()
