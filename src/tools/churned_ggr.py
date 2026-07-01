"""
churned_ggr.py
--------------
Computes total GGR (sports + casino) for a set of churned players over a
specified date window, using raw betslip and casino parquets.

GGR definitions:
  Sports  = sum(Stake - Payout)  for CreditType == "User Account" bets
  Casino  = sum(Stake - Payout)  where Stake > 0
  Total   = Sports GGR + Casino GGR

Usage (on the VM):
    python -m src.tools.churned_ggr \\
        --churn-result data/serving/high_churn_result.csv \\
        --start 2026-01-01 --end 2026-06-30 \\
        --out data/serving/high_churned_ggr.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from src.app_config import raw_dir
from src.kpis.io_utils import read_all_parquets, normalize_cols, to_num


def _sports_ggr(user_ids: set[int], start: str, end: str) -> pd.DataFrame:
    df_raw = read_all_parquets(raw_dir("betslips"), "betslips*.parquet")
    if df_raw.empty:
        print("[ggr] WARNING: no betslip parquets found.")
        return pd.DataFrame(columns=["userid", "sports_ggr"])

    df, col = normalize_cols(df_raw)
    uid = col.get("userid")
    dcol = col.get("placementdate")
    credit = col.get("credittype")
    stake = col.get("stake")
    payout = col.get("payout")

    if not all([uid, dcol, stake, payout]):
        missing = [k for k, v in {"userid": uid, "placementdate": dcol, "stake": stake, "payout": payout}.items() if not v]
        print(f"[ggr] WARNING: missing betslip columns: {missing}")
        return pd.DataFrame(columns=["userid", "sports_ggr"])

    if credit:
        df = df[df[credit].astype(str) == "User Account"]

    df["_dt"] = pd.to_datetime(df[dcol], errors="coerce")
    df = df[(df["_dt"] >= start) & (df["_dt"] <= end)].dropna(subset=["_dt"])

    df["_uid"] = to_num(df[uid], default=None)
    df = df.dropna(subset=["_uid"])
    df["_uid"] = df["_uid"].astype(int)
    df = df[df["_uid"].isin(user_ids)]

    df["_stake"] = to_num(df[stake], default=0.0)
    df["_payout"] = to_num(df[payout], default=0.0)
    df["_ggr"] = df["_stake"] - df["_payout"]

    result = df.groupby("_uid")["_ggr"].sum().reset_index()
    result.columns = ["userid", "sports_ggr"]
    return result


def _casino_ggr(user_ids: set[int], start: str, end: str) -> pd.DataFrame:
    df_raw = read_all_parquets(raw_dir("casino"), "*.parquet")
    if df_raw.empty:
        print("[ggr] WARNING: no casino parquets found.")
        return pd.DataFrame(columns=["userid", "casino_ggr"])

    df, col = normalize_cols(df_raw)
    uid = col.get("userid")
    dcol = col.get("placementdate")
    stake = col.get("stake")
    payout = col.get("payout")

    if not all([uid, dcol, stake, payout]):
        missing = [k for k, v in {"userid": uid, "placementdate": dcol, "stake": stake, "payout": payout}.items() if not v]
        print(f"[ggr] WARNING: missing casino columns: {missing}")
        return pd.DataFrame(columns=["userid", "casino_ggr"])

    df["_stake"] = to_num(df[stake], default=0.0)
    df = df[df["_stake"] > 0]

    df["_dt"] = pd.to_datetime(df[dcol], errors="coerce")
    df = df[(df["_dt"] >= start) & (df["_dt"] <= end)].dropna(subset=["_dt"])

    df["_uid"] = to_num(df[uid], default=None)
    df = df.dropna(subset=["_uid"])
    df["_uid"] = df["_uid"].astype(int)
    df = df[df["_uid"].isin(user_ids)]

    df["_payout"] = to_num(df[payout], default=0.0)
    df["_ggr"] = df["_stake"] - df["_payout"]

    result = df.groupby("_uid")["_ggr"].sum().reset_index()
    result.columns = ["userid", "casino_ggr"]
    return result


def main() -> None:
    p = argparse.ArgumentParser(description="GGR for a churned player cohort over a date window")
    p.add_argument("--churn-result", required=True,
                   help="Path to a check_atrisk_churn.py output CSV (must have userid + churned columns)")
    p.add_argument("--start", default="2026-01-01", help="Window start date YYYY-MM-DD (inclusive)")
    p.add_argument("--end", default="2026-06-30", help="Window end date YYYY-MM-DD (inclusive)")
    p.add_argument("--churned-only", action="store_true", default=True,
                   help="Restrict to churned==1 rows only (default: True)")
    p.add_argument("--all-baseline", action="store_true", default=False,
                   help="Include all baseline players (churned + retained) instead of churned-only")
    p.add_argument("--out", default=None, help="Output CSV path (default: alongside --churn-result)")
    args = p.parse_args()

    churn_df = pd.read_csv(args.churn_result)
    if "churned" not in churn_df.columns or "userid" not in churn_df.columns:
        raise SystemExit(f"--churn-result must have userid + churned columns, got: {list(churn_df.columns)}")

    if args.all_baseline:
        cohort = set(churn_df["userid"].astype(int).tolist())
        label = "all baseline"
    else:
        cohort = set(churn_df.loc[churn_df["churned"] == 1, "userid"].astype(int).tolist())
        label = "churned only"

    print(f"[ggr] cohort ({label}): {len(cohort):,} players")
    print(f"[ggr] window: {args.start} to {args.end}")

    sports = _sports_ggr(cohort, args.start, args.end)
    casino = _casino_ggr(cohort, args.start, args.end)

    per_user = pd.DataFrame({"userid": list(cohort)})
    per_user = per_user.merge(sports, on="userid", how="left")
    per_user = per_user.merge(casino, on="userid", how="left")
    per_user["sports_ggr"] = per_user["sports_ggr"].fillna(0.0)
    per_user["casino_ggr"] = per_user["casino_ggr"].fillna(0.0)
    per_user["total_ggr"] = per_user["sports_ggr"] + per_user["casino_ggr"]

    out_path = Path(args.out) if args.out else Path(args.churn_result).with_name(
        Path(args.churn_result).stem + "_ggr.csv")
    per_user.to_csv(out_path, index=False)

    sports_total = per_user["sports_ggr"].sum()
    casino_total = per_user["casino_ggr"].sum()
    total_ggr = per_user["total_ggr"].sum()
    players_with_ggr = int((per_user["total_ggr"] != 0).sum())
    avg_ggr = per_user.loc[per_user["total_ggr"] != 0, "total_ggr"].mean()

    print(f"\n=== GGR SUMMARY ({args.start} to {args.end}) — {label.upper()} ===")
    print(f"Players in cohort ................. {len(per_user):,}")
    print(f"Players with any GGR .............. {players_with_ggr:,}")
    print(f"Sports GGR ........................ R{sports_total:>14,.0f}")
    print(f"Casino GGR ........................ R{casino_total:>14,.0f}")
    print(f"Total GGR ......................... R{total_ggr:>14,.0f}")
    print(f"Avg GGR per active player ......... R{avg_ggr:>14,.0f}")
    print(f"\nSaved per-user detail -> {out_path}")


if __name__ == "__main__":
    main()
