"""
casino_kpis.py
---------------
Transforms casino Parquet increments into daily KPI summaries.

compute_casino_daily()  → date, casino_stake, casino_winnings, casino_ggr,
                          casino_bets, casino_actives,
                          horse_racing_stake, horse_racing_winnings, horse_racing_ggr,
                          horse_racing_bets, horse_racing_actives
compute_casino_by_provider() → provider_name, stake, winnings, ggr, bets
compute_casino_by_type()     → casino_type, stake, winnings, ggr
"""
from __future__ import annotations
import pandas as pd
from .io_utils import normalize_cols, ensure_cols, to_date, to_num


def compute_casino_daily(casino: pd.DataFrame) -> pd.DataFrame:
    """Daily casino KPIs from view_Casino.

    Horse Racing (IntelligentGamingBetmakers / Betmakers provider) is separated
    into dedicated columns (horse_racing_*) so the backend can add those figures
    to sports totals.  Casino columns exclude horse racing.
    """
    empty_cols = [
        "date", "casino_stake", "casino_winnings", "casino_ggr",
        "casino_bets", "casino_actives",
        "horse_racing_stake", "horse_racing_winnings", "horse_racing_ggr",
        "horse_racing_bets", "horse_racing_actives",
    ]
    if casino.empty:
        return pd.DataFrame(columns=empty_cols)

    casino, ccol = normalize_cols(casino)
    cols = ensure_cols(
        ccol,
        required_lower=["userid", "placementdate", "stake", "winnings"],
        context="Casino",
    )

    user_id = cols["userid"]
    date_c = cols["placementdate"]
    stake = cols["stake"]
    winnings = cols["winnings"]
    bets_col = ccol.get("betsnumber")
    provider_col = ccol.get("providername") or ccol.get("bookmakerprovider_name") or ccol.get("providerid")

    # Increments may overlap between runs; keep latest row per CasinoID.
    casino_id_col = ccol.get("casinoid")
    if casino_id_col:
        order_col = ccol.get("__cursor__") or ccol.get("insertdate") or date_c
        casino["_ord"] = pd.to_datetime(casino[order_col], errors="coerce")
        casino = casino.sort_values("_ord").drop_duplicates(subset=[casino_id_col], keep="last")

    casino["stake_num"]    = to_num(casino[stake], default=0.0)
    casino["winnings_num"] = to_num(casino[winnings], default=0.0)
    casino["casino_date"]  = to_date(casino[date_c])
    if bets_col:
        casino["bets_num"] = to_num(casino[bets_col], default=0.0)

    # Identify horse racing rows (Betmakers provider).
    if provider_col:
        _is_hr = casino[provider_col].astype(str).str.contains("Betmakers", case=False, na=False)
    else:
        _is_hr = pd.Series(False, index=casino.index)

    casino_only = casino[~_is_hr]
    horse_racing = casino[_is_hr]

    def _agg_daily(df: pd.DataFrame, prefix: str) -> pd.DataFrame:
        if df.empty:
            return pd.DataFrame(columns=["date"])
        agg: dict = {
            f"{prefix}stake":    ("stake_num", "sum"),
            f"{prefix}winnings": ("winnings_num", "sum"),
            f"{prefix}actives":  (user_id, "nunique"),
        }
        if bets_col:
            agg[f"{prefix}bets"] = ("bets_num", "sum")
        result = (
            df.dropna(subset=["casino_date"])
            .groupby("casino_date")
            .agg(**agg)
            .reset_index()
            .rename(columns={"casino_date": "date"})
        )
        result[f"{prefix}ggr"] = result[f"{prefix}stake"] - result[f"{prefix}winnings"]
        if f"{prefix}bets" not in result.columns:
            result[f"{prefix}bets"] = 0
        result[f"{prefix}bets"]    = result[f"{prefix}bets"].astype(int)
        result[f"{prefix}actives"] = result[f"{prefix}actives"].astype(int)
        return result

    c_out  = _agg_daily(casino_only, "casino_")
    hr_out = _agg_daily(horse_racing, "horse_racing_")

    all_dates = pd.DataFrame(
        {"date": pd.concat([c_out["date"], hr_out["date"]]).drop_duplicates()}
    )
    out = all_dates.merge(c_out, on="date", how="left").merge(hr_out, on="date", how="left").fillna(0)

    for col in ["casino_bets", "casino_actives", "horse_racing_bets", "horse_racing_actives"]:
        if col in out.columns:
            out[col] = out[col].astype(int)

    return out.sort_values("date")


def compute_casino_by_provider(casino: pd.DataFrame) -> pd.DataFrame:
    """Aggregate casino metrics grouped by provider."""
    if casino.empty:
        return pd.DataFrame(columns=["provider_name", "stake", "winnings", "ggr", "bets"])

    casino, ccol = normalize_cols(casino)
    provider_col = ccol.get("providername") or ccol.get("bookmakerprovider_name") or ccol.get("providerid")
    if not provider_col:
        return pd.DataFrame(columns=["provider_name", "stake", "winnings", "ggr", "bets"])

    casino_id_col = ccol.get("casinoid")
    if casino_id_col:
        order_col = ccol.get("__cursor__") or ccol.get("insertdate") or ccol.get("placementdate")
        casino["_ord"] = pd.to_datetime(casino[order_col], errors="coerce")
        casino = casino.sort_values("_ord").drop_duplicates(subset=[casino_id_col], keep="last")

    casino["stake_num"] = to_num(casino[ccol["stake"]], default=0.0)
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


def compute_casino_provider_daily(casino: pd.DataFrame) -> pd.DataFrame:
    """Daily provider-level casino metrics for range-filtered dashboard charts."""
    if casino.empty:
        return pd.DataFrame(
            columns=[
                "date",
                "provider_name",
                "date_provider_key",
                "date_provider_type_key",
                "casino_type",
                "stake",
                "winnings",
                "ggr",
                "bets",
            ]
        )

    casino, ccol = normalize_cols(casino)
    cols = ensure_cols(
        ccol,
        required_lower=["placementdate", "stake", "winnings"],
        context="Casino provider daily",
    )

    provider_col = ccol.get("providername") or ccol.get("bookmakerprovider_name") or ccol.get("providerid")
    if not provider_col:
        return pd.DataFrame(
            columns=[
                "date",
                "provider_name",
                "date_provider_key",
                "date_provider_type_key",
                "casino_type",
                "stake",
                "winnings",
                "ggr",
                "bets",
            ]
        )

    type_col = ccol.get("casinotype") or ccol.get("casinotypeid")
    date_c = cols["placementdate"]
    stake = cols["stake"]
    winnings = cols["winnings"]
    bets_col = ccol.get("betsnumber")

    casino_id_col = ccol.get("casinoid")
    if casino_id_col:
        order_col = ccol.get("__cursor__") or ccol.get("insertdate") or date_c
        casino["_ord"] = pd.to_datetime(casino[order_col], errors="coerce")
        casino = casino.sort_values("_ord").drop_duplicates(subset=[casino_id_col], keep="last")

    # Normalise provider name: strip "Intelligent" prefix from IGT/Betmakers products.
    raw_provider = casino[provider_col].astype(str)
    casino["provider_name"] = raw_provider.str.replace(r"^Intelligent", "", regex=True).str.strip()

    # Classify Horse Racing (IntelligentGamingBetmakers / Betmakers) vs Casino.
    # All other providers fall through to the casino_type column value.
    _is_horse_racing = raw_provider.str.contains("Betmakers", case=False, na=False)
    if type_col:
        _type_from_col = casino[type_col].astype(str)
        casino["casino_type"] = _type_from_col.where(~_is_horse_racing, other="Horse Racing")
    else:
        casino["casino_type"] = _is_horse_racing.map({True: "Horse Racing", False: "Casino"})
    casino["stake_num"] = to_num(casino[stake], default=0.0)
    casino["winnings_num"] = to_num(casino[winnings], default=0.0)
    casino["casino_date"] = to_date(casino[date_c])

    agg: dict = {
        "stake": ("stake_num", "sum"),
        "winnings": ("winnings_num", "sum"),
    }
    if bets_col:
        casino["bets_num"] = to_num(casino[bets_col], default=0.0)
        agg["bets"] = ("bets_num", "sum")

    out = (
        casino.dropna(subset=["casino_date"])
        .groupby(["casino_date", "provider_name", "casino_type"])
        .agg(**agg)
        .reset_index()
        .rename(columns={"casino_date": "date"})
    )
    out["date_provider_key"] = (
        pd.to_datetime(out["date"], errors="coerce").dt.strftime("%Y-%m-%d")
        + "|"
        + out["provider_name"].fillna("").astype(str).str.strip()
    )
    out["date_provider_type_key"] = (
        pd.to_datetime(out["date"], errors="coerce").dt.strftime("%Y-%m-%d")
        + "|"
        + out["provider_name"].fillna("").astype(str).str.strip()
        + "|"
        + out["casino_type"].fillna("").astype(str).str.strip()
    )
    out["ggr"] = out["stake"] - out["winnings"]
    if "bets" not in out.columns:
        out["bets"] = 0
    return out.sort_values(["date", "ggr"], ascending=[True, False])


def compute_casino_by_type(casino: pd.DataFrame) -> pd.DataFrame:
    """Aggregate casino metrics grouped by CasinoType."""
    if casino.empty:
        return pd.DataFrame(columns=["casino_type", "stake", "winnings", "ggr"])

    casino, ccol = normalize_cols(casino)
    type_col = ccol.get("casinotype") or ccol.get("casinotypeid")
    if not type_col:
        return pd.DataFrame(columns=["casino_type", "stake", "winnings", "ggr"])

    casino_id_col = ccol.get("casinoid")
    if casino_id_col:
        order_col = ccol.get("__cursor__") or ccol.get("insertdate") or ccol.get("placementdate")
        casino["_ord"] = pd.to_datetime(casino[order_col], errors="coerce")
        casino = casino.sort_values("_ord").drop_duplicates(subset=[casino_id_col], keep="last")

    casino["stake_num"] = to_num(casino[ccol["stake"]], default=0.0)
    casino["winnings_num"] = to_num(casino[ccol["winnings"]], default=0.0)

    out = (
        casino.groupby(type_col)
        .agg(stake=("stake_num", "sum"), winnings=("winnings_num", "sum"))
        .reset_index()
        .rename(columns={type_col: "casino_type"})
    )
    out["ggr"] = out["stake"] - out["winnings"]
    return out.sort_values("ggr", ascending=False)
