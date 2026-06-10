"""
vip_kpis.py
-----------
Builds vip_roster.parquet from the client-provided vip_list.csv.

Each row in vip_list.csv represents one VIP "stint" (period) for a user
under a given account manager and lifecycle stage:

    User ID, Account Manager, VIP Lifecycle Stage, Onboard Date, Offboard Date

Offboard Date = "-" means the stint is currently active (no end date yet).
A user may appear multiple times if they were onboarded/offboarded more
than once — each row is a distinct stint with its own date range.

Output: serving/vip_roster.parquet
Columns:
    userid, account_manager, vip_lifecycle_stage,
    onboard_date, offboard_date (NaT if currently active),
    is_current (bool), is_date_error (bool — offboard < onboard)

Run from the project root:
    python -m src.kpis.vip_kpis
"""
from __future__ import annotations

import pandas as pd

from src.app_config import PROJECT_ROOT, SERVING_ROOT

VIP_CSV_PATH = PROJECT_ROOT / "vip_list.csv"
OUT_FILE = SERVING_ROOT / "vip_roster.parquet"


def build_vip_roster() -> pd.DataFrame:
    if not VIP_CSV_PATH.exists():
        print(f"[vip] {VIP_CSV_PATH} not found - skipping")
        return pd.DataFrame()

    df = pd.read_csv(VIP_CSV_PATH)
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={
        "User ID": "userid",
        "Account Manager": "account_manager",
        "VIP Lifecycle Stage": "vip_lifecycle_stage",
        "Onboard Date": "onboard_date",
        "Offboard Date": "offboard_date",
    })

    df["userid"] = pd.to_numeric(df["userid"], errors="coerce").astype("Int64")
    df["account_manager"] = df["account_manager"].astype(str).str.strip()

    # Normalize lifecycle stage casing (e.g. "Time-out" vs "Time-Out")
    stage_raw = df["vip_lifecycle_stage"].astype(str).str.strip()
    stage_map = {s.lower(): s for s in ["Hosted VIP", "Unhosted VIP", "Self Excluded", "Time-Out"]}
    df["vip_lifecycle_stage"] = stage_raw.map(lambda s: stage_map.get(s.lower(), s))
    df["onboard_date"] = pd.to_datetime(df["onboard_date"], format="%d/%m/%Y", errors="coerce")

    raw_offboard = df["offboard_date"].astype(str).str.strip()
    is_current = raw_offboard.isin(["-", "", "nan", "NaT", "None"])
    df["offboard_date"] = pd.to_datetime(
        raw_offboard.where(~is_current, None), format="%d/%m/%Y", errors="coerce"
    )
    df["is_current"] = df["offboard_date"].isna()

    # Data quality flag — Offboard Date earlier than Onboard Date.
    # Kept in the roster (not dropped) but flagged so KPI queries can
    # exclude these stints from period-overlap calculations if needed.
    df["is_date_error"] = df["offboard_date"].notna() & (df["offboard_date"] < df["onboard_date"])

    df = df.dropna(subset=["userid"]).sort_values(["userid", "onboard_date"])
    return df.reset_index(drop=True)


def main() -> None:
    df = build_vip_roster()
    if df.empty:
        return
    SERVING_ROOT.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT_FILE, index=False)
    print(f"[vip] Saved {len(df)} rows -> {OUT_FILE}")
    print(f"[vip] Distinct users: {df['userid'].nunique()}")
    print(f"[vip] Currently active stints: {int(df['is_current'].sum())}")
    n_err = int(df["is_date_error"].sum())
    if n_err:
        print(f"[vip] WARNING: {n_err} stints have Offboard Date before Onboard Date (flagged via is_date_error, not dropped)")
    print("[vip] Lifecycle stage breakdown:")
    print(df["vip_lifecycle_stage"].value_counts().to_string())
    print("[vip] Account manager breakdown:")
    print(df["account_manager"].value_counts().to_string())


if __name__ == "__main__":
    main()
