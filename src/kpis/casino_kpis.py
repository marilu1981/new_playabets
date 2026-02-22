"""
casino_kpis.py
---------------
Transforms casino Parquet increments into daily KPI summaries.

compute_casino_daily()  → date, casino_stake, casino_winnings, casino_ggr,
                          casino_bets, casino_actives
compute_casino_by_provider() → provider_name, stake, winnings, ggr, bets
compute_casino_by_type()     → casino_type, stake, winnings, ggr
"""
from __future__ import annotations
import pandas as pd
from .io_utils import normalize_cols, ensure_cols, to_date, to_num


def compute_casino_daily(casino: pd.DataFrame) -> pd.DataFrame:
    """Daily casino KPIs from view_Casino."""
    if casino.empty:
        return pd.DataFrame(columns=[
            "date", "casino_stake", "casino_winnings", "casino_ggr",
            "casino_bets", "casino_actives",
        ])

    casino, ccol = normalize_cols(casino)
    cols = ensure_cols(
        ccol,
        required_lower=["userid", "placementdate", "stake", "winnings"],
        context="Casino",
    )

    user_id    = cols["userid"]
    date_c     = cols["placementdate"]
    stake      = cols["stake"]
    winnings   = cols["winnings"]
    bets_col   = ccol.get("betsnumber")

    casino["stake_num"]    = to_num(casino[stake], default=0.0)
    casino["winnings_num"] = to_num(casino[winnings], default=0.0)
    casino["casino_date"]  = to_date(casino[date_c])

    agg: dict = {
        "casino_stake":    ("stake_num", "sum"),
        "casino_winnings": ("winnings_num", "sum"),
        "casino_actives":  (user_id, "nunique"),
    }
    if bets_col:
        casino["bets_num"] = to_num(casino[bets_col], default=0.0)
        agg["casino_bets"] = ("bets_num", "sum")

    out = (
        casino.dropna(subset=["casino_date"])
        .groupby("casino_date")
        .agg(**agg)
        .reset_index()
        .rename(columns={"casino_date": "date"})
    )
    out["casino_ggr"] = out["casino_stake"] - out["casino_winnings"]
    if "casino_bets" not in out.columns:
        out["casino_bets"] = 0
    out["casino_bets"]    = out["casino_bets"].astype(int)
    out["casino_actives"] = out["casino_actives"].astype(int)
    return out.sort_values("date")


def compute_casino_by_provider(casino: pd.DataFrame) -> pd.DataFrame:
    """Aggregate casino metrics grouped by provider."""
    if casino.empty:
        return pd.DataFrame(columns=["provider_name", "stake", "winnings", "ggr", "bets"])

    casino, ccol = normalize_cols(casino)
    provider_col = ccol.get("providername") or ccol.get("bookmakerprovider_name") or ccol.get("providerid")
    if not provider_col:
        return pd.DataFrame(columns=["provider_name", "stake", "winnings", "ggr", "bets"])

    casino["stake_num"]    = to_num(casino[ccol["stake"]], default=0.0)
    casino["winnings_num"] = to_num(casino[ccol["winnings"]], default=0.0)

    agg: dict = {
        "stake":    ("stake_num", "sum"),
        "winnings": ("winnings_num", "sum"),
    }
    if "betsnumber" in ccol:
        casino["bets_num"] = to_num(casino[ccol["betsnumber"]], default=0.0)
        agg["bets"] = ("bets_num", "sum")

    out = casino.groupby(provider_col).agg(**agg).reset_index()
    out = out.rename(columns={provider_col: "provider_name"})
    out["ggr"] = out["stake"] - out["winnings"]
    if "bets" not in out.columns:
        out["bets"] = 0
    return out.sort_values("ggr", ascending=False)


def compute_casino_by_type(casino: pd.DataFrame) -> pd.DataFrame:
    """Aggregate casino metrics grouped by CasinoType."""
    if casino.empty:
        return pd.DataFrame(columns=["casino_type", "stake", "winnings", "ggr"])

    casino, ccol = normalize_cols(casino)
    type_col = ccol.get("casinotype") or ccol.get("casinotypeid")
    if not type_col:
        return pd.DataFrame(columns=["casino_type", "stake", "winnings", "ggr"])

    casino["stake_num"]    = to_num(casino[ccol["stake"]], default=0.0)
    casino["winnings_num"] = to_num(casino[ccol["winnings"]], default=0.0)

    out = (
        casino.groupby(type_col)
        .agg(stake=("stake_num", "sum"), winnings=("winnings_num", "sum"))
        .reset_index()
        .rename(columns={type_col: "casino_type"})
    )
    out["ggr"] = out["stake"] - out["winnings"]
    return out.sort_values("ggr", ascending=False)
