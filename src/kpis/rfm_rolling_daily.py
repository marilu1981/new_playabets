from __future__ import annotations
from pathlib import Path
import pandas as pd

from .io_utils import normalize_cols, ensure_cols, to_dt, to_date, to_num

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BETSLIPS_DIR = PROJECT_ROOT / "data" / "raw" / "betslips"
SERVING_DIR = PROJECT_ROOT / "data" / "serving"
OUT_PATH = SERVING_DIR / "rfm_rolling_daily.parquet"

SETTLED_STATUS = "Paid - Closed"


def read_all_parquets(folder: Path, pattern: str) -> pd.DataFrame:
    files = sorted(folder.glob(pattern))
    if not files:
        return pd.DataFrame()
    return pd.concat((pd.read_parquet(f) for f in files), ignore_index=True)


def main() -> None:
    SERVING_DIR.mkdir(parents=True, exist_ok=True)

    betslips = read_all_parquets(BETSLIPS_DIR, "betslips_increment_*.parquet")
    if betslips.empty:
        raise FileNotFoundError("No betslips increment parquets found")

    betslips, bcol = normalize_cols(betslips)
    cols = ensure_cols(bcol, ["userid", "stake", "winnings"], "Betslips")

    uid = cols["userid"]
    stake = cols["stake"]
    winnings = cols["winnings"]

    placement_c = bcol.get("placementdate")
    payment_c = bcol.get("paymentdate")
    status_c = bcol.get("betslipstatus")

    if not placement_c:
        raise RuntimeError("Betslips missing placementdate")

    bs = betslips.copy()
    bs["userid"] = bs[uid].astype("int64", errors="ignore")
    bs["stake_num"] = to_num(bs[stake], 0.0)
    bs["winnings_num"] = to_num(bs[winnings], 0.0)
    bs["place_dt"] = to_dt(bs[placement_c])
    bs["place_day"] = bs["place_dt"].dt.floor("D")

    # settlement monetary truth
    if payment_c:
        bs["pay_dt"] = to_dt(bs[payment_c])
        bs["pay_day"] = bs["pay_dt"].dt.floor("D")
    else:
        bs["pay_day"] = bs["place_day"]

    if status_c:
        settled = bs[bs[status_c].astype(str).eq(SETTLED_STATUS)].copy()
    else:
        settled = bs.copy()

    settled["ggr"] = settled["stake_num"] - settled["winnings_num"]

    # Build a continuous date index from min(place_day) to max(place_day)
    day_min = bs["place_day"].min()
    day_max = bs["place_day"].max()
    days = pd.date_range(day_min, day_max, freq="D")

    # Precompute per-day distinct bettors and stakes (placement-based)
    daily_bettors = bs.groupby("place_day")["userid"].nunique().reindex(days, fill_value=0)
    daily_bet_count = bs.groupby("place_day")["userid"].size().reindex(days, fill_value=0)

    # Settlement monetary by pay_day
    daily_settled_stake = settled.groupby("pay_day")["stake_num"].sum().reindex(days, fill_value=0.0)
    daily_ggr = settled.groupby("pay_day")["ggr"].sum().reindex(days, fill_value=0.0)

    # Rolling 30 day
    roll_window = 30
    rolling_active_bettors_30d = (
        bs.sort_values("place_day")
          .groupby("place_day")["userid"]
          .apply(lambda s: set(s))  # sets per day
    )

    # Efficient-ish rolling distinct using cumulative sets is tricky; simpler approach:
    # Use a per-user daily presence table only on days where user appears (sparse), then rolling nunique via pandas:
    presence = bs[["userid", "place_day"]].drop_duplicates()
    # Create a boolean pivot-like table? Too big. Instead compute rolling distinct by expanding window using groupby+rolling on counts per user:
    # We'll approximate "rolling active bettors" as rolling sum of daily unique bettors (not exact distinct across window).
    # If you want exact distinct 30d, best is in SQL. For now: exact using python can be heavy.
    # We'll do an exact-but-acceptable approach for your scale by using day-by-day set union.
    active_30d = []
    day_to_users = {d: set(grp["userid"].tolist()) for d, grp in presence.groupby("place_day")}
    for d in days:
        window_days = pd.date_range(d - pd.Timedelta(days=roll_window - 1), d, freq="D")
        s = set()
        for wd in window_days:
            s |= day_to_users.get(wd, set())
        active_30d.append(len(s))

    active_30d = pd.Series(active_30d, index=days)

    rolling_stake_30d = daily_settled_stake.rolling(roll_window, min_periods=1).sum()
    rolling_ggr_30d = daily_ggr.rolling(roll_window, min_periods=1).sum()

    out = pd.DataFrame({
        "date": [d.date() for d in days],
        "bettors_daily": daily_bettors.values.astype(int),
        "bets_daily": daily_bet_count.values.astype(int),
        "active_bettors_30d": active_30d.values.astype(int),
        "settled_stake_30d": rolling_stake_30d.values.astype(float),
        "ggr_30d": rolling_ggr_30d.values.astype(float),
    })

    # Per-active bettor monetary
    out["stake_per_active_30d"] = out.apply(
        lambda r: (r["settled_stake_30d"] / r["active_bettors_30d"]) if r["active_bettors_30d"] else 0.0,
        axis=1,
    )
    out["ggr_per_active_30d"] = out.apply(
        lambda r: (r["ggr_30d"] / r["active_bettors_30d"]) if r["active_bettors_30d"] else 0.0,
        axis=1,
    )

    out.to_parquet(OUT_PATH, index=False)
    print(f"Wrote rolling RFM daily: {OUT_PATH} ({len(out)} rows)")


if __name__ == "__main__":
    main()
