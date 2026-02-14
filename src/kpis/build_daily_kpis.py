from __future__ import annotations

from pathlib import Path
import pandas as pd

from .io_utils import read_all_parquets
from .users_kpis import compute_registrations_daily
from .betslips_kpis import compute_betslips_daily_kpis
from .rfm_kpis import build_rfm_users, RFMWindow


PROJECT_ROOT = Path(__file__).resolve().parents[2]
USERS_DIR = PROJECT_ROOT / "data" / "raw" / "users"
BETSLIPS_DIR = PROJECT_ROOT / "data" / "raw" / "betslips"
SESSIONS_DIR = None

SERVING_DIR = PROJECT_ROOT / "data" / "serving"
OUT_KPIS = SERVING_DIR / "daily_kpis.parquet"
OUT_RFM = SERVING_DIR / "rfm_users.parquet"

print("PROJECT_ROOT:", PROJECT_ROOT)
print("USERS_DIR:", USERS_DIR, "exists:", USERS_DIR.exists())
print("BETSLIPS_DIR:", BETSLIPS_DIR, "exists:", BETSLIPS_DIR.exists())
print("SESSIONS_DIR:", SESSIONS_DIR, "exists:", (SESSIONS_DIR.exists() if SESSIONS_DIR else False))



def summarize_rfm_daily(rfm_users: pd.DataFrame, date: pd.Timestamp) -> pd.DataFrame:
    """
    Build a single-row daily snapshot of RFM segments and churn-like flags.
    """
    if rfm_users.empty:
        return pd.DataFrame([{
            "date": date.date(),
            "rfm_champions": 0,
            "rfm_loyal": 0,
            "rfm_big_spenders": 0,
            "rfm_mid": 0,
            "rfm_at_risk": 0,
            "rfm_dormant": 0,
            "rfm_active_7d": 0,
            "rfm_active_30d": 0,
            "rfm_dormant_30d": 0,
        }])

    seg_counts = rfm_users["segment"].value_counts().to_dict()
    recency = rfm_users["recency_days"]

    row = {
        "date": date.date(),
        "rfm_champions": int(seg_counts.get("Champions", 0)),
        "rfm_loyal": int(seg_counts.get("Loyal", 0)),
        "rfm_big_spenders": int(seg_counts.get("Big Spenders", 0)),
        "rfm_mid": int(seg_counts.get("Mid", 0)),
        "rfm_at_risk": int(seg_counts.get("At Risk", 0)),
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

    # sessions are optional but preferred
    sessions = None

    regs = compute_registrations_daily(users)
    bs_daily = compute_betslips_daily_kpis(betslips)

    daily = pd.merge(regs, bs_daily, on="date", how="outer").fillna(0).sort_values("date")

    # Build RFM as-of latest day present in daily KPI table (or today)
    as_of = pd.Timestamp(max(daily["date"])) if len(daily) else pd.Timestamp.now().normalize()
    rfm_users = build_rfm_users(users=users, betslips=betslips, sessions=sessions, as_of=as_of, window=RFMWindow(days=30))

    # Save user-level RFM for drill-down
    rfm_users.to_parquet(OUT_RFM, index=False)

    # Add a single daily row summary (or you can compute for each date later)
    rfm_daily = summarize_rfm_daily(rfm_users, pd.Timestamp(as_of))

    daily = daily.merge(rfm_daily, on="date", how="left").fillna(0)
    daily.to_parquet(OUT_KPIS, index=False)

    print(f"Wrote KPIs: {OUT_KPIS} ({len(daily)} rows)")
    print(f"Wrote RFM users: {OUT_RFM} ({len(rfm_users)} rows)")


if __name__ == "__main__":
    main()
