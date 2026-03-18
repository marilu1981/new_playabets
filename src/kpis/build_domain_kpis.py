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

from pathlib import Path
import pandas as pd

from .io_utils import read_all_parquets
from .transactions_kpi import compute_transactions_daily
from .bonus_kpis import compute_bonus_daily
from .ftd_kpis import compute_ftd_daily
from .casino_kpis import compute_casino_daily, compute_casino_provider_daily

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW = PROJECT_ROOT / "data" / "raw"
SERVING = PROJECT_ROOT / "data" / "serving"


def main() -> None:
    SERVING.mkdir(parents=True, exist_ok=True)

    # Transactions
    tx_dir = RAW / "transactions"
    if tx_dir.exists():
        tx_raw = read_all_parquets(tx_dir, "transactions_increment_*.parquet")
        out = SERVING / "transactions_daily.parquet"
        if tx_raw.empty:
            print("[domain_kpis] Transactions raw is empty - keeping existing serving file")
        else:
            tx_daily = compute_transactions_daily(tx_raw)
            tx_daily.to_parquet(out, index=False)
            print(f"[domain_kpis] Transactions daily: {len(tx_daily)} rows -> {out}")
    else:
        print("[domain_kpis] No transactions raw dir - skipping")

    # Bonus
    bonus_dir = RAW / "bonus"
    if bonus_dir.exists():
        bonus_raw = read_all_parquets(bonus_dir, "bonuses_increment_*.parquet")
        campaigns_latest = bonus_dir / "campaigns_latest.parquet"
        campaigns_raw = pd.read_parquet(campaigns_latest) if campaigns_latest.exists() else pd.DataFrame()
        out = SERVING / "bonus_daily.parquet"
        if bonus_raw.empty:
            print("[domain_kpis] Bonus raw is empty - keeping existing serving file")
        else:
            bonus_daily = compute_bonus_daily(bonus_raw, campaigns=campaigns_raw)
            bonus_daily.to_parquet(out, index=False)
            print(f"[domain_kpis] Bonus daily: {len(bonus_daily)} rows -> {out}")
    else:
        print("[domain_kpis] No bonus raw dir - skipping")

    # First Deposits (true FTD)
    ftd_dir = RAW / "first_deposits"
    if ftd_dir.exists():
        ftd_raw = read_all_parquets(ftd_dir, "first_deposits_increment_*.parquet")
        out = SERVING / "ftd_daily.parquet"
        if ftd_raw.empty:
            print("[domain_kpis] FTD raw is empty - keeping existing serving file")
        else:
            ftd_daily = compute_ftd_daily(ftd_raw)
            ftd_daily.to_parquet(out, index=False)
            print(f"[domain_kpis] FTD daily: {len(ftd_daily)} rows -> {out}")
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
