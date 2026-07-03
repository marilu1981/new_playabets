"""
build_rfm_history.py - Backfill + incremental RFM monthly snapshots

Computes RFM segment counts as-of each month-end from DATA_START_DATE to today,
writing one row per month to data/serving/rfm_monthly_snapshots.parquet.

Run once to backfill:
    python -m src.kpis.build_rfm_history

Idempotent - skips months already present in the output file.
"""
from __future__ import annotations

import calendar
from datetime import date

import pandas as pd

from src.app_config import SERVING_ROOT, raw_dir
from .io_utils import read_all_parquets
from .rfm_kpis import build_rfm_users, RFMWindow
from .build_daily_kpis import summarize_rfm_daily

# Earliest month for which all data sources are complete
DATA_START_DATE = date(2026, 1, 1)

USERS_DIR = raw_dir("users")
BETSLIPS_DIR = raw_dir("betslips")
SESSIONS_DIR = raw_dir("sessions")
CASINO_DIR = raw_dir("casino")
FTD_DIR = raw_dir("first_deposits")

OUT_MONTHLY = SERVING_ROOT / "rfm_monthly_snapshots.parquet"

RFM_COLS = ["date", "rfm_vip", "rfm_active", "rfm_new", "rfm_cooling", "rfm_lapsed", "rfm_dormant"]


def _month_end(year: int, month: int) -> date:
    return date(year, month, calendar.monthrange(year, month)[1])


def _months_to_compute() -> list[date]:
    """Return month-end dates from DATA_START_DATE up to and including the current month."""
    today = date.today()
    start = DATA_START_DATE
    months: list[date] = []
    y, m = start.year, start.month
    while True:
        me = _month_end(y, m)
        # Include current month-in-progress with today as the as-of date
        months.append(min(me, today))
        if y == today.year and m == today.month:
            break
        m += 1
        if m > 12:
            m = 1
            y += 1
    return months


def _load_existing() -> pd.DataFrame:
    if OUT_MONTHLY.exists():
        df = pd.read_parquet(OUT_MONTHLY)
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"]).dt.date
            return df
    return pd.DataFrame(columns=RFM_COLS)


def build_monthly_snapshot(
    users: pd.DataFrame,
    betslips: pd.DataFrame,
    casino: pd.DataFrame,
    sessions: pd.DataFrame,
    first_deposits: pd.DataFrame,
    as_of_date: date,
) -> pd.DataFrame:
    """Compute one-row RFM snapshot as of a given date."""
    as_of = pd.Timestamp(as_of_date)
    rfm_users = build_rfm_users(
        users=users,
        betslips=betslips,
        casino=casino,
        sessions=sessions,
        first_deposits=first_deposits,
        as_of=as_of,
        window=RFMWindow(days=30),
    )
    row = summarize_rfm_daily(rfm_users, as_of)
    # Keep only the core RFM columns
    keep = [c for c in RFM_COLS if c in row.columns]
    return row[keep]


def main() -> None:
    SERVING_ROOT.mkdir(parents=True, exist_ok=True)

    print("Loading raw data...")
    users = read_all_parquets(USERS_DIR, "users_increment_*.parquet")
    betslips = read_all_parquets(BETSLIPS_DIR, "betslips_increment_*.parquet")
    sessions = read_all_parquets(SESSIONS_DIR, "sessions_increment_*.parquet") if SESSIONS_DIR.exists() else pd.DataFrame()
    casino = read_all_parquets(CASINO_DIR, "casino_increment_*.parquet") if CASINO_DIR.exists() else pd.DataFrame()
    first_deposits = read_all_parquets(FTD_DIR, "first_deposits_increment_*.parquet") if FTD_DIR.exists() else pd.DataFrame()

    if users.empty:
        print("No user data found - cannot compute RFM. Exiting.")
        return

    existing = _load_existing()
    existing_dates: set[date] = set(existing["date"].tolist()) if not existing.empty else set()

    months = _months_to_compute()
    new_rows: list[pd.DataFrame] = []

    for as_of_date in months:
        # For current month: always recompute (data may have grown since last run)
        today = date.today()
        is_current_month = (as_of_date.year == today.year and as_of_date.month == today.month)
        if as_of_date in existing_dates and not is_current_month:
            print(f"  {as_of_date} - already present, skipping")
            continue

        print(f"  {as_of_date} - computing RFM as-of {as_of_date}...")
        try:
            row = build_monthly_snapshot(users, betslips, casino, sessions, first_deposits, as_of_date)
            new_rows.append(row)
            counts = {c: int(row[c].iloc[0]) for c in RFM_COLS if c != "date" and c in row.columns}
            print(f"             -> {counts}")
        except Exception as exc:
            print(f"             FAILED: {exc}")

    if not new_rows:
        print("Nothing new to write.")
        return

    new_df = pd.concat(new_rows, ignore_index=True)

    # Merge with existing, replacing current-month row if present
    if not existing.empty:
        today = date.today()
        current_month_dates = {d for d in existing_dates if d.year == today.year and d.month == today.month}
        keep_existing = existing[~existing["date"].isin(current_month_dates)]
        combined = pd.concat([keep_existing, new_df], ignore_index=True)
    else:
        combined = new_df

    combined["date"] = pd.to_datetime(combined["date"])
    combined = combined.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    combined.to_parquet(OUT_MONTHLY, index=False)
    print(f"\nWrote {len(combined)} rows to {OUT_MONTHLY}")


if __name__ == "__main__":
    main()
