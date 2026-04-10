"""
build_domain_kpis.py
--------------------
Builds serving-domain parquet files:
  - transactions_daily.parquet
  - bonus_daily.parquet
  - ftd_daily.parquet
  - casino_daily.parquet

Run from project root:
    python -m src.kpis.build_domain_kpis
"""
from __future__ import annotations

import pandas as pd

from src.app_config import ENABLE_TRANSACTIONS, RAW_ROOT, SERVING_ROOT
from .io_utils import read_all_parquets
from .transactions_kpi import compute_transactions_daily
from .bonus_kpis import compute_bonus_daily
from .ftd_kpis import compute_ftd_daily
from .casino_kpis import compute_casino_daily, compute_casino_provider_daily
from .conversion_cohorts_kpi import compute_conversion_cohorts_daily

RAW = RAW_ROOT
SERVING = SERVING_ROOT


def main() -> None:
    SERVING.mkdir(parents=True, exist_ok=True)

    # Transactions — two possible sources:
    # 1. Pre-aggregated files (transactions_daily_agg_*.parquet) written by
    #    incremental_transactions_simple.py — used when raw row export is not
    #    feasible (view_transactions has ~4M rows/day, no usable index).
    # 2. Raw row increments (transactions_increment_*.parquet) written by
    #    incremental_transactions.py — used if a row-level export ever works.
    if ENABLE_TRANSACTIONS:
        tx_dir = RAW / "transactions"
        out = SERVING / "transactions_daily.parquet"
        if tx_dir.exists():
            # Pre-aggregated files take priority — merge all daily agg files.
            agg_files = sorted(tx_dir.glob("transactions_daily_agg_*.parquet"))
            if agg_files:
                tx_daily = pd.concat(
                    (pd.read_parquet(f) for f in agg_files), ignore_index=True
                )
                # Deduplicate: keep latest file's data for each date.
                tx_daily["date"] = pd.to_datetime(tx_daily["date"]).dt.date
                tx_daily = tx_daily.sort_values("date").drop_duplicates(
                    subset=["date"], keep="last"
                )
                # Ensure all expected columns exist (fill with 0 if absent).
                for col in [
                    "deposits", "withdrawals", "net_deposits",
                    "unique_depositors", "deposit_count", "withdrawal_count",
                    "tx_count_accepted", "tx_count_pending",
                    "tx_count_system", "tx_count_other_status",
                ]:
                    if col not in tx_daily.columns:
                        tx_daily[col] = 0
                if "tx_count" not in tx_daily.columns:
                    tx_daily["tx_count"] = (
                        tx_daily.get("deposit_count", 0)
                        + tx_daily.get("withdrawal_count", 0)
                    )
                tx_daily.to_parquet(out, index=False)
                print(f"[domain_kpis] Transactions daily (pre-agg): {len(tx_daily)} rows -> {out}")
            else:
                # Fall back to raw row-level increments.
                tx_raw = read_all_parquets(tx_dir, "transactions_increment_*.parquet")
                if tx_raw.empty:
                    print("[domain_kpis] Transactions raw is empty - keeping existing serving file")
                else:
                    tx_daily = compute_transactions_daily(tx_raw)
                    tx_daily.to_parquet(out, index=False)
                    print(f"[domain_kpis] Transactions daily (raw rows): {len(tx_daily)} rows -> {out}")
        else:
            print("[domain_kpis] No transactions raw dir - skipping")
    else:
        print("[domain_kpis] Transactions disabled - skipping transactions_daily build")

    # Bonus
    bonus_dir = RAW / "bonus"
    if bonus_dir.exists():
        bonus_raw = read_all_parquets(bonus_dir, "bonuses_increment_*.parquet")
        campaigns_latest = bonus_dir / "campaigns_latest.parquet"
        campaigns_raw = pd.read_parquet(campaigns_latest) if campaigns_latest.exists() else pd.DataFrame()
        freebets_latest = bonus_dir / "freebets_latest.parquet"
        freebets_raw = pd.read_parquet(freebets_latest) if freebets_latest.exists() else pd.DataFrame()
        out = SERVING / "bonus_daily.parquet"
        if bonus_raw.empty:
            print("[domain_kpis] Bonus raw is empty - keeping existing serving file")
        else:
            bonus_daily = compute_bonus_daily(bonus_raw, campaigns=campaigns_raw, freebets=freebets_raw)
            bonus_daily.to_parquet(out, index=False)
            print(f"[domain_kpis] Bonus daily: {len(bonus_daily)} rows -> {out}")
    else:
        print("[domain_kpis] No bonus raw dir - skipping")

    # First Deposits (true FTD)
    # The extract writes a single first_deposits_full.parquet (one row per user,
    # globally earliest deposit date across all causali). Fall back to any
    # increment files if the full snapshot hasn't been generated yet.
    ftd_dir = RAW / "first_deposits"
    if ftd_dir.exists():
        full_snapshot = ftd_dir / "first_deposits_full.parquet"
        if full_snapshot.exists():
            ftd_raw = pd.read_parquet(full_snapshot)
            print(f"[domain_kpis] FTD full snapshot: {len(ftd_raw)} rows")
        else:
            ftd_raw = read_all_parquets(ftd_dir, "first_deposits_increment_*.parquet")
            print(f"[domain_kpis] FTD increments (legacy): {len(ftd_raw)} rows")
        out = SERVING / "ftd_daily.parquet"
        if ftd_raw.empty:
            print("[domain_kpis] FTD raw is empty - keeping existing serving file")
        else:
            ftd_daily = compute_ftd_daily(ftd_raw)
            ftd_daily.to_parquet(out, index=False)
            print(f"[domain_kpis] FTD daily: {len(ftd_daily)} rows -> {out}")

            users_dir = RAW / "users"
            users_raw = read_all_parquets(users_dir, "users_increment_*.parquet") if users_dir.exists() else pd.DataFrame()
            cohorts_out = SERVING / "conversion_cohorts_daily.parquet"
            if users_raw.empty:
                print("[domain_kpis] Users raw is empty - skipping conversion cohorts build")
            else:
                conversion_cohorts = compute_conversion_cohorts_daily(users_raw, ftd_raw)
                conversion_cohorts.to_parquet(cohorts_out, index=False)
                print(f"[domain_kpis] Conversion cohorts daily: {len(conversion_cohorts)} rows -> {cohorts_out}")
    else:
        print("[domain_kpis] No first_deposits raw dir - skipping")

    # Casino
    casino_dir = RAW / "casino"
    if casino_dir.exists():
        casino_raw = read_all_parquets(casino_dir, "casino_increment_*.parquet")
        if casino_raw.empty:
            print("[domain_kpis] Casino raw is empty - keeping existing serving files")
        else:
            out = SERVING / "casino_daily.parquet"
            casino_daily = compute_casino_daily(casino_raw)
            casino_daily.to_parquet(out, index=False)
            print(f"[domain_kpis] Casino daily: {len(casino_daily)} rows -> {out}")

            providers_out = SERVING / "casino_providers_daily.parquet"
            casino_providers_daily = compute_casino_provider_daily(casino_raw)
            casino_providers_daily.to_parquet(providers_out, index=False)
            print(f"[domain_kpis] Casino providers daily: {len(casino_providers_daily)} rows -> {providers_out}")
    else:
        print("[domain_kpis] No casino raw dir - skipping")

    print("[domain_kpis] Done.")


if __name__ == "__main__":
    main()
