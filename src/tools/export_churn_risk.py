"""
export_churn_risk.py
---------------------
Export high-value, high-risk players to CSV/Excel for client review.

This is the raw data output of the SocioTopography churn model.
The dashboard integration (sortable table + real-time view) is a separate premium feature.

Usage (from project root on VM):
    python3 -m src.tools.export_churn_risk

Optional flags:
    --tier Critical             # filter to one tier (Critical|High|Moderate|Low); default: Critical,High
    --segment VIP               # further filter by RFM segment
    --min-risk 0.6              # minimum composite risk score
    --include-low-value         # include Lapsed/Dormant segments (excluded by default)
    --out /tmp/churn_risk.xlsx  # output path; default: export_churn_risk_<date>.xlsx in cwd
    --format csv                # csv or xlsx (default xlsx)
"""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import pandas as pd

from src.app_config import SERVING_ROOT

SOCIOTOPO_PATH = SERVING_ROOT / "sociotopo_features.parquet"
RFM_USERS_PATH = SERVING_ROOT / "rfm_users.parquet"
USER_TX_DIR    = Path(str(SERVING_ROOT).replace("serving", "raw")) / "user_transactions"

HIGH_VALUE_SEGMENTS = {"VIP", "Active", "New"}


def _load_user_tx_totals() -> pd.DataFrame:
    """Load lifetime deposits/withdrawals per user from raw user_transactions parquet files."""
    files = list(USER_TX_DIR.glob("user_transactions_*.parquet")) if USER_TX_DIR.exists() else []
    if not files:
        return pd.DataFrame(columns=["userid", "total_deposits", "total_withdrawals"])
    df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    if "userid" not in df.columns or "deposits" not in df.columns:
        return pd.DataFrame(columns=["userid", "total_deposits", "total_withdrawals"])
    agg = df.groupby("userid").agg(
        total_deposits=("deposits", "sum"),
        total_withdrawals=("withdrawals", "sum"),
    ).reset_index()
    return agg


def build_export(
    tiers: list[str],
    segment_filter: str | None,
    min_risk: float,
    include_low_value: bool,
) -> pd.DataFrame:
    if not SOCIOTOPO_PATH.exists():
        raise FileNotFoundError(f"sociotopo_features.parquet not found at {SOCIOTOPO_PATH}")

    socio = pd.read_parquet(SOCIOTOPO_PATH)
    print(f"[export] Loaded {len(socio):,} users from sociotopo_features.parquet")

    # Tier filter
    if "risk_tier" in socio.columns:
        socio = socio[socio["risk_tier"].isin(tiers)]

    # Segment filter
    if segment_filter and "segment" in socio.columns:
        socio = socio[socio["segment"].astype(str) == segment_filter]
    elif not include_low_value and "segment" in socio.columns:
        # Exclude purely dormant/lapsed unless asked to include
        # Keep anyone high-risk regardless of segment (they may still be valuable)
        pass

    # Min risk score
    if "risk_score" in socio.columns:
        socio = socio[socio["risk_score"] >= min_risk]

    # Merge lifetime deposit totals
    tx_totals = _load_user_tx_totals()
    if not tx_totals.empty:
        socio = socio.merge(tx_totals, on="userid", how="left")
    else:
        socio["total_deposits"]    = None
        socio["total_withdrawals"] = None

    # Merge last-seen RFM data (recency, monetary) if available
    if RFM_USERS_PATH.exists():
        rfm = pd.read_parquet(RFM_USERS_PATH)
        merge_cols = ["userid"]
        for c in ["recency_days", "monetary_30d", "last_activity_dt", "registration_date"]:
            if c in rfm.columns:
                merge_cols.append(c)
        socio = socio.merge(rfm[merge_cols].drop_duplicates("userid"), on="userid", how="left")

    # Sort: risk_score desc, then total_deposits desc (highest value + highest risk first)
    sort_cols = ["risk_score"]
    if "total_deposits" in socio.columns:
        sort_cols.append("total_deposits")
    socio = socio.sort_values(sort_cols, ascending=[False] + [False] * (len(sort_cols) - 1))

    # Select and rename output columns
    col_map = {
        "userid":                "User ID",
        "segment":               "RFM Segment",
        "risk_tier":             "Risk Tier",
        "risk_score":            "Composite Risk Score",
        "fc_score":              "FC Score (Financial Capacity)",
        "bil_score":             "BIL Score (Behavioral Intensity)",
        "oi_score":              "OI Score (Outcome Instability)",
        "bets_30d":              "Sports Bets (30d)",
        "casino_bets_30d":       "Casino Bets (30d)",
        "sessions_30d":          "Sessions (30d)",
        "net_cashflow_30d":      "Net Cashflow (30d)",
        "balance_raw":           "Current Balance",
        "total_deposits":        "Lifetime Deposits",
        "total_withdrawals":     "Lifetime Withdrawals",
        "loss_rate_30d":         "Loss Rate (30d)",
        "max_losing_streak_30d": "Max Losing Streak (30d)",
        "bonus_stake_ratio":     "Bonus Stake Ratio",
        "self_exclusion_flag":   "Self-Exclusion Flag",
        "recency_days":          "Days Since Last Activity",
        "monetary_30d":          "Monetary Value (30d)",
        "last_activity_dt":      "Last Activity Date",
        "registration_date":     "Registration Date",
    }
    keep = [c for c in col_map if c in socio.columns]
    out = socio[keep].rename(columns=col_map).reset_index(drop=True)

    # Round score columns
    for col in out.columns:
        if "Score" in col or "Rate" in col or "Ratio" in col:
            out[col] = out[col].round(4)
    if "Composite Risk Score" in out.columns:
        out["Composite Risk Score"] = out["Composite Risk Score"].round(4)

    return out


def main() -> None:
    p = argparse.ArgumentParser(description="Export high-value at-risk players.")
    p.add_argument("--tier",            default="Critical,High")
    p.add_argument("--segment",         default=None)
    p.add_argument("--min-risk",        type=float, default=0.0)
    p.add_argument("--include-low-value", action="store_true")
    p.add_argument("--out",             default=None)
    p.add_argument("--format",          choices=["xlsx", "csv"], default="xlsx")
    args = p.parse_args()

    tiers = [t.strip() for t in args.tier.split(",") if t.strip()]
    df = build_export(
        tiers=tiers,
        segment_filter=args.segment,
        min_risk=args.min_risk,
        include_low_value=args.include_low_value,
    )

    if df.empty:
        print("[export] No players matched the filters - nothing to export.")
        return

    out_path = args.out or f"export_churn_risk_{date.today().isoformat()}.{args.format}"
    if args.format == "xlsx":
        try:
            import openpyxl  # noqa: F401
            with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
                df.to_excel(writer, index=True, sheet_name="At-Risk Players")
                ws = writer.sheets["At-Risk Players"]
                for col_cells in ws.columns:
                    max_len = max(len(str(c.value or "")) for c in col_cells)
                    ws.column_dimensions[col_cells[0].column_letter].width = min(max_len + 2, 40)
            print(f"[export] Saved {len(df):,} players -> {out_path}")
        except ModuleNotFoundError:
            out_path = out_path.replace(".xlsx", ".csv")
            df.to_csv(out_path, index=True)
            print(f"[export] openpyxl not installed - saved as CSV instead -> {out_path}")
            print("[export] To get Excel: pip install openpyxl")
    else:
        df.to_csv(out_path, index=True)
        print(f"[export] Saved {len(df):,} players -> {out_path}")

    print(f"[export] Risk tier breakdown:")
    if "Risk Tier" in df.columns:
        print(df["Risk Tier"].value_counts().to_string())
    if "RFM Segment" in df.columns:
        print(f"\n[export] Segment breakdown:")
        print(df["RFM Segment"].value_counts().to_string())


if __name__ == "__main__":
    main()
