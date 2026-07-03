"""
bonus_analysis.py
-----------------
Bonus performance analysis from RAW data (not the dashboard). Builds a value
funnel and player/campaign breakdowns, output as CSVs.

Funnel (per campaign and overall):
    Bonus Issued (Credited only)
      -> Deposits Generated   (first-deposit flag/date per bonused player; FTD has no amount)
      -> Turnover Generated   (betslips + casino by bonused players; betslips also linked
                               to the funding campaign via BonusCampaignID)
      -> Withdrawals          (NOT available per-player/campaign; daily totals only -> omitted)
      -> Estimated Net Value  = player GGR (turnover - winnings) - bonus issued

Also identifies:
    - Highest / lowest performing campaigns (by turnover per bonus rand)
    - Players receiving repeated bonuses
    - Bonus-heavy but low-value players

DATA NOTES / ASSUMPTIONS:
    - "Issued" = BonusStatus == "Credited". Cancelled / To Be Credited are reported
      separately but excluded from issued totals (they were never given to the player).
    - Real-money turnover only: sports CreditType == "User Account", casino Stake > 0.
    - Deposits/withdrawals are stored as DAILY AGGREGATES with no userid/campaign, so
      they cannot be attributed. first_deposits gives a per-user FTD flag/date but no amount.
    - Net Value is a GGR-based proxy, not an accounting net (no per-user withdrawals).

Usage (on the VM, full data):
    python -m src.tools.bonus_analysis --start 2026-01-01 --outdir data/serving/bonus_analysis
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from src.app_config import raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols, to_dt, to_num


ISSUED_STATUS = "Credited"


def _load_bonuses(start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    raw = read_all_parquets(raw_dir("bonus"), "bonuses_increment*.parquet")
    if raw.empty:
        return raw
    df, m = normalize_cols(raw)
    uid, camp, amt, status, dcol = (m.get("userid"), m.get("campaignid"),
                                    m.get("amount"), m.get("bonusstatus"), m.get("insertdate"))
    df = df.rename(columns={uid: "userid", camp: "campaignid", amt: "amount",
                            status: "bonus_status", dcol: "insert_date"})
    df["userid"] = to_num(df["userid"], default=np.nan)
    df["campaignid"] = to_num(df["campaignid"], default=np.nan)
    df["amount"] = to_num(df["amount"], default=0.0)
    df["insert_date"] = to_dt(df["insert_date"])
    df = df.dropna(subset=["userid", "insert_date"])
    df["userid"] = df["userid"].astype(int)
    df = df[(df["insert_date"] >= start) & (df["insert_date"] <= end)]
    # Dedup: same BonusID can appear across overlapping increment/compacted files
    bid = m.get("bonusid")
    if bid and bid in df.columns:
        df = df.sort_values("insert_date").drop_duplicates(subset=[bid], keep="last")
    else:
        # No BonusID - fall back to a row signature to avoid double-counting
        df = df.drop_duplicates(subset=["userid", "campaignid", "amount", "insert_date"], keep="last")
    return df


def _load_campaigns() -> pd.DataFrame:
    raw = read_all_parquets(raw_dir("bonus"), "campaigns_latest.parquet")
    if raw.empty:
        return raw
    df, m = normalize_cols(raw)
    keep = {m.get("campaignid"): "campaignid", m.get("name"): "campaign_name",
            m.get("bonustype"): "bonus_type", m.get("code"): "campaign_code"}
    keep = {k: v for k, v in keep.items() if k}
    df = df[list(keep)].rename(columns=keep)
    df["campaignid"] = to_num(df["campaignid"], default=np.nan)
    df = df.dropna(subset=["campaignid"])
    # Defensive: one row per campaign (compacted + latest files can overlap on the VM)
    df = df.drop_duplicates(subset=["campaignid"], keep="last")
    return df


def _load_turnover(start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    """
    Per-bet turnover with credit_type kept (not filtered out):
      - credit_type "User Account" = real-money wagering (commercial value).
      - credit_type "Bonus"/"Freebets" = bonus-funded wagering; these carry
        BonusCampaignID, so they attribute turnover to the funding campaign.
    Casino has no credit type / campaign link, so it's treated as real money.
    """
    frames = []
    bs_raw = read_all_parquets(raw_dir("betslips"), "betslips*.parquet")
    if not bs_raw.empty:
        bs, m = normalize_cols(bs_raw)
        uid, dcol, stake, win, credit, bcamp = (m.get("userid"), m.get("placementdate"),
            m.get("stake"), m.get("winnings"), m.get("credittype"), m.get("bonuscampaignid"))
        bs["userid"] = to_num(bs[uid], default=np.nan)
        bs["_dt"] = to_dt(bs[dcol])
        bs["stake"] = to_num(bs[stake], default=0.0)
        bs["win"] = to_num(bs[win], default=0.0)
        bs["credit_type"] = bs[credit].astype(str) if credit else "User Account"
        bs["bonus_campaignid"] = to_num(bs[bcamp], default=np.nan) if bcamp else np.nan
        bs = bs.dropna(subset=["userid", "_dt"])
        bs = bs[(bs["_dt"] >= start) & (bs["_dt"] <= end)]
        bs["userid"] = bs["userid"].astype(int)
        frames.append(bs[["userid", "_dt", "stake", "win", "credit_type", "bonus_campaignid"]].assign(product="sports"))

    ca_raw = read_all_parquets(raw_dir("casino"), "*.parquet")
    if not ca_raw.empty:
        ca, m = normalize_cols(ca_raw)
        uid, dcol, stake, win = m.get("userid"), m.get("placementdate"), m.get("stake"), m.get("winnings")
        ca["userid"] = to_num(ca[uid], default=np.nan)
        ca["_dt"] = to_dt(ca[dcol])
        ca["stake"] = to_num(ca[stake], default=0.0)
        ca["win"] = to_num(ca[win], default=0.0)
        ca = ca[ca["stake"] > 0]  # real money
        ca = ca.dropna(subset=["userid", "_dt"])
        ca = ca[(ca["_dt"] >= start) & (ca["_dt"] <= end)]
        ca["userid"] = ca["userid"].astype(int)
        ca["credit_type"] = "User Account"
        ca["bonus_campaignid"] = np.nan
        frames.append(ca[["userid", "_dt", "stake", "win", "credit_type", "bonus_campaignid"]].assign(product="casino"))

    if not frames:
        return pd.DataFrame(columns=["userid", "_dt", "stake", "win", "credit_type", "bonus_campaignid", "product"])
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
    out = out.sort_values("ftd_date").drop_duplicates("userid", keep="first")  # true first deposit
    return out


def main() -> None:
    p = argparse.ArgumentParser(description="Bonus performance analysis from raw data")
    p.add_argument("--start", default="2026-01-01", help="Start date YYYY-MM-DD (bonus InsertDate)")
    p.add_argument("--end", default=None, help="End date YYYY-MM-DD (default: today)")
    p.add_argument("--outdir", default="data/serving/bonus_analysis", help="Output directory for CSVs")
    p.add_argument("--repeat-threshold", type=int, default=3, help="Bonuses count to be 'repeated' (default 3)")
    p.add_argument("--exclude-campaigns", nargs="*", default=["100% First Deposit Bonus - Casino"],
                   help="Campaign names to exclude from campaign-level funnel (turnover attribution unreliable for FTD bonuses)")
    args = p.parse_args()

    start = pd.Timestamp(args.start)
    end = pd.Timestamp(args.end) if args.end else pd.Timestamp.now().normalize() + pd.Timedelta(days=1)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"[bonus] window {start.date()} -> {end.date()}")

    bonuses = _load_bonuses(start, end)
    if bonuses.empty:
        print("[bonus] no bonus rows in window - aborting.")
        return
    campaigns = _load_campaigns()
    turnover = _load_turnover(start, end)
    ftd = _load_ftd(start, end)

    # ---- status split (context) ----
    status_split = bonuses.groupby("bonus_status")["amount"].agg(["count", "sum"]).reset_index()
    status_split.columns = ["bonus_status", "bonus_count", "bonus_amount"]
    status_split.to_csv(outdir / "00_bonus_status_split.csv", index=False)

    issued = bonuses[bonuses["bonus_status"] == ISSUED_STATUS].copy()
    print(f"[bonus] issued (Credited): {len(issued):,} bonuses, R{issued['amount'].sum():,.0f}")

    # ---- per-player turnover/GGR (REAL MONEY only - User Account) ----
    real = turnover[turnover["credit_type"] == "User Account"] if not turnover.empty else turnover
    if not real.empty:
        per_user = real.groupby("userid").agg(
            turnover=("stake", "sum"),
            winnings=("win", "sum"),
            bets=("stake", "size"),
        ).reset_index()
        per_user["ggr"] = per_user["turnover"] - per_user["winnings"]
    else:
        per_user = pd.DataFrame(columns=["userid", "turnover", "winnings", "bets", "ggr"])

    # ---- per-player bonus rollup ----
    pl_bonus = issued.groupby("userid").agg(
        bonus_issued=("amount", "sum"),
        bonus_count=("amount", "size"),
        campaigns_used=("campaignid", "nunique"),
    ).reset_index()

    # ---- PLAYER funnel table ----
    player = pl_bonus.merge(per_user, on="userid", how="left")
    player = player.merge(ftd.assign(got_ftd=1)[["userid", "ftd_date", "got_ftd"]], on="userid", how="left")
    for c in ["turnover", "winnings", "ggr", "bets"]:
        player[c] = player[c].fillna(0.0)
    player["got_ftd"] = player["got_ftd"].fillna(0).astype(int)
    player["net_value_est"] = player["ggr"] - player["bonus_issued"]
    player = player.sort_values("bonus_issued", ascending=False)
    player.to_csv(outdir / "01_player_funnel.csv", index=False)

    # ---- CAMPAIGN funnel table ----
    # Bonus side: issued per campaign.
    camp_bonus = issued.groupby("campaignid").agg(
        bonus_issued=("amount", "sum"),
        bonus_count=("amount", "size"),
        players=("userid", "nunique"),
    ).reset_index()
    # Turnover linked to a campaign = bonus-funded betslips (CreditType Bonus/Freebets),
    # which carry BonusCampaignID. This is the wagering the bonus directly drove.
    linked = turnover.dropna(subset=["bonus_campaignid"]).copy()
    if not linked.empty:
        linked["bonus_campaignid"] = linked["bonus_campaignid"].astype(int)
        camp_turn = linked.groupby("bonus_campaignid").agg(
            linked_turnover=("stake", "sum"),
            linked_winnings=("win", "sum"),
            linked_bets=("stake", "size"),
        ).reset_index().rename(columns={"bonus_campaignid": "campaignid"})
    else:
        camp_turn = pd.DataFrame(columns=["campaignid", "linked_turnover", "linked_winnings", "linked_bets"])

    camp = camp_bonus.merge(camp_turn, on="campaignid", how="left")
    if not campaigns.empty:
        camp = camp.merge(campaigns, on="campaignid", how="left")
    for c in ["linked_turnover", "linked_winnings", "linked_bets"]:
        camp[c] = camp.get(c, 0.0)
        camp[c] = camp[c].fillna(0.0)
    camp["linked_ggr"] = camp["linked_turnover"] - camp["linked_winnings"]
    # Performance metric: turnover generated per rand of bonus issued.
    camp["turnover_per_bonus_rand"] = np.where(camp["bonus_issued"] > 0,
                                               camp["linked_turnover"] / camp["bonus_issued"], 0.0)
    camp["net_value_est"] = camp["linked_ggr"] - camp["bonus_issued"]
    camp = camp.sort_values("bonus_issued", ascending=False)
    camp.to_csv(outdir / "02_campaign_funnel.csv", index=False)

    # ---- highest / lowest performing campaigns (min spend to be meaningful) ----
    # Exclude FTD-type campaigns: their turnover is real-money (not BonusCampaignID-linked),
    # so linked_turnover understates value and net_value_est is misleadingly negative.
    excluded = set(args.exclude_campaigns) if args.exclude_campaigns else set()
    if excluded and "campaign_name" in camp.columns:
        excluded_rows = camp[camp["campaign_name"].isin(excluded)]
        if not excluded_rows.empty:
            names = excluded_rows["campaign_name"].unique().tolist()
            print(f"[bonus] excluding from campaign rankings (FTD attribution gap): {names}")
        camp_ranked = camp[~camp["campaign_name"].isin(excluded)].copy()
    else:
        camp_ranked = camp.copy()
    meaningful = camp_ranked[camp_ranked["bonus_issued"] >= 1000].copy()
    ranked = meaningful.sort_values("turnover_per_bonus_rand", ascending=False)
    ranked.head(20).to_csv(outdir / "03_top_campaigns.csv", index=False)
    ranked.tail(20).to_csv(outdir / "04_bottom_campaigns.csv", index=False)

    # ---- players receiving repeated bonuses ----
    repeat = player[player["bonus_count"] >= args.repeat_threshold].sort_values("bonus_count", ascending=False)
    repeat.to_csv(outdir / "05_repeated_bonus_players.csv", index=False)

    # ---- bonus-heavy but low-value players ----
    # High bonus (top quartile of issued) but low/negative net value.
    if len(player) > 4:
        bonus_q75 = player["bonus_issued"].quantile(0.75)
    else:
        bonus_q75 = player["bonus_issued"].median()
    low_value = player[(player["bonus_issued"] >= bonus_q75) & (player["net_value_est"] <= 0)]
    low_value = low_value.sort_values("net_value_est")
    low_value.to_csv(outdir / "06_bonus_heavy_low_value.csv", index=False)

    # ---- overall funnel summary ----
    total_issued = issued["amount"].sum()
    bonused_users = set(issued["userid"])
    bonused_turn = per_user[per_user["userid"].isin(bonused_users)]
    summary = pd.DataFrame([{
        "window_start": start.date(), "window_end": (end - pd.Timedelta(days=1)).date(),
        "bonus_issued_total": round(total_issued, 2),
        "bonus_issued_count": len(issued),
        "bonused_players": len(bonused_users),
        "bonused_players_with_ftd": int(player["got_ftd"].sum()),
        "turnover_by_bonused_players": round(bonused_turn["turnover"].sum(), 2),
        "ggr_by_bonused_players": round(bonused_turn["ggr"].sum(), 2),
        "est_net_value_bonused": round(bonused_turn["ggr"].sum() - total_issued, 2),
        "turnover_linked_to_campaigns": round(camp["linked_turnover"].sum(), 2),
        "NOTE": "withdrawals/deposit-value not available per-user; net value is GGR-based proxy",
    }])
    summary.to_csv(outdir / "07_funnel_summary.csv", index=False)

    print("\n=== BONUS FUNNEL SUMMARY ===")
    for k, v in summary.iloc[0].items():
        print(f"  {k}: {v}")
    print(f"\n[bonus] wrote 8 CSVs -> {outdir}/")


if __name__ == "__main__":
    main()
