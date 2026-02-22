"""
build_domain_kpis.py
---------------------
Orchestrates the transform step for domain-specific KPIs:
  - Transactions → data/serving/transactions_daily.parquet
  - Bonus        → data/serving/bonus_daily.parquet
  - Casino       → data/serving/casino_daily.parquet
  - Commissions  → data/serving/commissions_daily.parquet

Run from the project root:
    python -m src.kpis.build_domain_kpis
"""
from __future__ import annotations

from pathlib import Path
import pandas as pd

from .io_utils import read_all_parquets
from .transactions_kpi import compute_transactions_daily
from .bonus_kpis import compute_bonus_daily
from .casino_kpis import compute_casino_daily
from .commissions_kpis import compute_commissions_by_period

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW          = PROJECT_ROOT / "data" / "raw"
SERVING      = PROJECT_ROOT / "data" / "serving"


def main() -> None:
    SERVING.mkdir(parents=True, exist_ok=True)

    # ---- Transactions ----
    tx_dir = RAW / "transactions"
    if tx_dir.exists():
        tx_raw = read_all_parquets(tx_dir, "transactions_increment_*.parquet")
        tx_daily = compute_transactions_daily(tx_raw)
        out = SERVING / "transactions_daily.parquet"
        tx_daily.to_parquet(out, index=False)
        print(f"[domain_kpis] Transactions daily: {len(tx_daily)} rows → {out}")
    else:
        print("[domain_kpis] No transactions raw dir — skipping")

    # ---- Bonus ----
    bonus_dir = RAW / "bonus"
    if bonus_dir.exists():
        bonus_raw = read_all_parquets(bonus_dir, "bonuses_increment_*.parquet")
        bonus_daily = compute_bonus_daily(bonus_raw)
        out = SERVING / "bonus_daily.parquet"
        bonus_daily.to_parquet(out, index=False)
        print(f"[domain_kpis] Bonus daily: {len(bonus_daily)} rows → {out}")
    else:
        print("[domain_kpis] No bonus raw dir — skipping")

    # ---- Casino ----
    casino_dir = RAW / "casino"
    if casino_dir.exists():
        casino_raw = read_all_parquets(casino_dir, "casino_increment_*.parquet")
        casino_daily = compute_casino_daily(casino_raw)
        out = SERVING / "casino_daily.parquet"
        casino_daily.to_parquet(out, index=False)
        print(f"[domain_kpis] Casino daily: {len(casino_daily)} rows → {out}")
    else:
        print("[domain_kpis] No casino raw dir — skipping")

    # ---- Commissions ----
    comm_dir = RAW / "commissions"
    if comm_dir.exists():
        def _load(name: str) -> pd.DataFrame:
            p = comm_dir / f"{name}_full.parquet"
            return pd.read_parquet(p) if p.exists() else pd.DataFrame()

        comm_daily = compute_commissions_by_period(
            sport_direct   = _load("sport_direct"),
            sport_network  = _load("sport_network"),
            casino_direct  = _load("casino_direct"),
            casino_network = _load("casino_network"),
        )
        out = SERVING / "commissions_daily.parquet"
        comm_daily.to_parquet(out, index=False)
        print(f"[domain_kpis] Commissions daily: {len(comm_daily)} rows → {out}")
    else:
        print("[domain_kpis] No commissions raw dir — skipping")

    print("[domain_kpis] Done.")


if __name__ == "__main__":
    main()
