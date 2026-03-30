from __future__ import annotations

import pandas as pd

from src.app_config import PROJECT_ROOT, SERVING_ROOT, raw_dir
from .io_utils import read_all_parquets
from .users_kpis import compute_registrations_daily
from .betslips_kpis import compute_betslips_daily_kpis
from .rfm_kpis import build_rfm_users, RFMWindow

USERS_DIR = raw_dir("users")
BETSLIPS_DIR = raw_dir("betslips")
SESSIONS_DIR = raw_dir("sessions")
CASINO_DIR = raw_dir("casino")

SERVING_DIR = SERVING_ROOT
OUT_KPIS = SERVING_DIR / "daily_kpis.parquet"
OUT_RFM = SERVING_DIR / "rfm_users.parquet"

print("PROJECT_ROOT:", PROJECT_ROOT)
print("USERS_DIR:", USERS_DIR, "exists:", USERS_DIR.exists())
print("BETSLIPS_DIR:", BETSLIPS_DIR, "exists:", BETSLIPS_DIR.exists())
print("SESSIONS_DIR:", SESSIONS_DIR, "exists:", (SESSIONS_DIR.exists() if SESSIONS_DIR else False))
print("CASINO_DIR:", CASINO_DIR, "exists:", CASINO_DIR.exists())



def summarize_rfm_daily(rfm_users: pd.DataFrame, date: pd.Timestamp) -> pd.DataFrame:
    """
    Build a single-row daily snapshot of RFM segments and churn-like flags.
    """
    if rfm_users.empty:
        return pd.DataFrame([{
            "date": date.date(),
            "rfm_vip": 0,
            "rfm_active": 0,
            "rfm_new": 0,
            "rfm_at_risk": 0,
            "rfm_lapsed": 0,
            "rfm_dormant": 0,
            "rfm_active_7d": 0,
            "rfm_active_30d": 0,
            "rfm_dormant_30d": 0,
        }])

    seg_counts = rfm_users["segment"].value_counts().to_dict()
    recency = rfm_users["recency_days"]

    row = {
        "date": date.date(),
        "rfm_vip": int(seg_counts.get("VIP", 0)),
        "rfm_active": int(seg_counts.get("Active", 0)),
        "rfm_new": int(seg_counts.get("New", 0)),
        "rfm_at_risk": int(seg_counts.get("At Risk", 0)),
        "rfm_lapsed": int(seg_counts.get("Lapsed", 0)),
        "rfm_dormant": int(seg_counts.get("Dormant", 0)),
        "rfm_active_7d": int((recency <= 7).sum()),
        "rfm_active_30d": int((recency <= 30).sum()),
        "rfm_dormant_30d": int((recency > 30).sum()),
    }
    return pd.DataFrame([row])


def main() -> None:
    SERVING_DIR.mkdir(parents=True, exist_ok=True)

    users = read_all_parquets(USERS_DIR, "users_increment_*.parquet")
    betslips = read_all_parquets(BETSLIPS_DIR, "betslips_increment_*.parquet")
    sessions = read_all_parquets(SESSIONS_DIR, "sessions_increment_*.parquet") if SESSIONS_DIR.exists() else pd.DataFrame()
    casino = read_all_parquets(CASINO_DIR, "casino_increment_*.parquet") if CASINO_DIR.exists() else pd.DataFrame()

    regs = compute_registrations_daily(users)
    bs_daily = compute_betslips_daily_kpis(betslips)

    daily = pd.merge(regs, bs_daily, on="date", how="outer").fillna(0).sort_values("date")

    # Build RFM as-of the latest activity day present across core inputs.
    as_of_candidates: list[pd.Timestamp] = []
    if len(daily):
        as_of_candidates.append(pd.Timestamp(max(daily["date"])))
    if not sessions.empty and "logindate" in {c.lower(): c for c in sessions.columns}:
        session_col = next(c for c in sessions.columns if c.lower() == "logindate")
        max_session_dt = pd.to_datetime(sessions[session_col], errors="coerce").max()
        if pd.notna(max_session_dt):
            as_of_candidates.append(pd.Timestamp(max_session_dt).normalize())
    if not casino.empty and "placementdate" in {c.lower(): c for c in casino.columns}:
        casino_col = next(c for c in casino.columns if c.lower() == "placementdate")
        max_casino_dt = pd.to_datetime(casino[casino_col], errors="coerce").max()
        if pd.notna(max_casino_dt):
            as_of_candidates.append(pd.Timestamp(max_casino_dt).normalize())
    as_of = max(as_of_candidates) if as_of_candidates else pd.Timestamp.now().normalize()

    rfm_users = build_rfm_users(
        users=users,
        betslips=betslips,
        casino=casino,
        sessions=sessions,
        as_of=as_of,
        window=RFMWindow(days=30),
    )

    # Save user-level RFM for drill-down
    rfm_users.to_parquet(OUT_RFM, index=False)

    # Add a single daily row summary.
    # Keep the RFM scoring as-of the newest available activity date, but attach the
    # summary to the latest existing KPI date so we do not create a fake latest row
    # with zero non-RFM metrics when sessions/casino are fresher than sportsbook KPIs.
    snapshot_date = pd.Timestamp(max(daily["date"])) if len(daily) else pd.Timestamp(as_of)
    rfm_daily = summarize_rfm_daily(rfm_users, snapshot_date)

    if daily.empty:
        daily = pd.DataFrame([{"date": snapshot_date.date()}])

    daily = daily.merge(rfm_daily, on="date", how="left").fillna(0)

    int_cols = [
        "registrations",
        "actives_sports",
        "betslips_count",
        "betslips_settled_count",
        "betslips_won_count",
        "betslips_cancelled_count",
        "rfm_vip",
        "rfm_active",
        "rfm_new",
        "rfm_at_risk",
        "rfm_lapsed",
        "rfm_dormant",
        "rfm_active_7d",
        "rfm_active_30d",
        "rfm_dormant_30d",
    ]
    float_cols = [
        "placed_stake",
        "open_exposure_stake",
        "settled_stake",
        "settled_winnings",
        "ggr",
        "hold_pct",
        "win_rate",
        "cancel_rate",
    ]

    for col in int_cols:
        if col in daily.columns:
            daily[col] = pd.to_numeric(daily[col], errors="coerce").fillna(0).astype(int)
    for col in float_cols:
        if col in daily.columns:
            daily[col] = pd.to_numeric(daily[col], errors="coerce").fillna(0.0).astype(float)

    daily.to_parquet(OUT_KPIS, index=False)

    print(f"Wrote KPIs: {OUT_KPIS} ({len(daily)} rows)")
    print(f"Wrote RFM users: {OUT_RFM} ({len(rfm_users)} rows)")


if __name__ == "__main__":
    main()
