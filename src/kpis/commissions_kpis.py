"""
commissions_kpis.py
--------------------
Transforms commission Parquet snapshots into summary KPIs.

compute_commissions_summary() → total_commissions, by_product, top_agents
compute_commissions_by_period() → date (CreationDate), commissions, stake, winnings
"""
from __future__ import annotations
import pandas as pd
from .io_utils import normalize_cols, to_date, to_num


def _load_combined(
    sport_direct: pd.DataFrame,
    sport_network: pd.DataFrame,
    casino_direct: pd.DataFrame,
    casino_network: pd.DataFrame,
) -> pd.DataFrame:
    """Concatenate all four commission frames with a _source tag."""
    frames = []
    for df, tag in [
        (sport_direct,  "sport_direct"),
        (sport_network, "sport_network"),
        (casino_direct, "casino_direct"),
        (casino_network,"casino_network"),
    ]:
        if not df.empty:
            d = df.copy()
            d["_source"] = tag
            frames.append(d)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def compute_commissions_summary(
    sport_direct: pd.DataFrame,
    sport_network: pd.DataFrame,
    casino_direct: pd.DataFrame,
    casino_network: pd.DataFrame,
) -> dict:
    """
    Returns:
      total_commissions, sport_commissions, casino_commissions,
      total_agents, top_agents (list of {user_id, commissions})
    """
    combined = _load_combined(sport_direct, sport_network, casino_direct, casino_network)
    if combined.empty:
        return {
            "total_commissions": 0.0,
            "sport_commissions": 0.0,
            "casino_commissions": 0.0,
            "total_agents": 0,
            "top_agents": [],
        }

    combined, ccol = normalize_cols(combined)
    comm_col = ccol.get("commissions")
    user_col = ccol.get("userid")

    if not comm_col:
        return {"total_commissions": 0.0, "sport_commissions": 0.0,
                "casino_commissions": 0.0, "total_agents": 0, "top_agents": []}

    combined["comm_num"] = to_num(combined[comm_col], default=0.0)

    total = float(combined["comm_num"].sum())
    sport = float(
        combined[combined["_source"].str.startswith("sport")]["comm_num"].sum()
    )
    casino = float(
        combined[combined["_source"].str.startswith("casino")]["comm_num"].sum()
    )

    total_agents = int(combined[user_col].nunique()) if user_col else 0

    top_agents: list[dict] = []
    if user_col:
        ta = (
            combined.groupby(user_col)["comm_num"]
            .sum()
            .sort_values(ascending=False)
            .head(10)
            .reset_index()
        )
        top_agents = [
            {"user_id": int(r[user_col]), "commissions": float(r["comm_num"])}
            for _, r in ta.iterrows()
        ]

    return {
        "total_commissions": total,
        "sport_commissions": sport,
        "casino_commissions": casino,
        "total_agents": total_agents,
        "top_agents": top_agents,
    }


def compute_commissions_by_period(
    sport_direct: pd.DataFrame,
    sport_network: pd.DataFrame,
    casino_direct: pd.DataFrame,
    casino_network: pd.DataFrame,
) -> pd.DataFrame:
    """Daily commission totals (by CreationDate)."""
    combined = _load_combined(sport_direct, sport_network, casino_direct, casino_network)
    if combined.empty:
        return pd.DataFrame(columns=["date", "commissions", "stake", "winnings"])

    combined, ccol = normalize_cols(combined)
    date_col = ccol.get("creationdate")
    comm_col = ccol.get("commissions")
    stake_col = ccol.get("stake")
    win_col   = ccol.get("winnings")

    if not (date_col and comm_col):
        return pd.DataFrame(columns=["date", "commissions", "stake", "winnings"])

    combined["comm_num"]  = to_num(combined[comm_col], default=0.0)
    combined["comm_date"] = to_date(combined[date_col])

    agg: dict = {"commissions": ("comm_num", "sum")}
    if stake_col:
        combined["stake_num"] = to_num(combined[stake_col], default=0.0)
        agg["stake"] = ("stake_num", "sum")
    if win_col:
        combined["win_num"] = to_num(combined[win_col], default=0.0)
        agg["winnings"] = ("win_num", "sum")

    out = (
        combined.dropna(subset=["comm_date"])
        .groupby("comm_date")
        .agg(**agg)
        .reset_index()
        .rename(columns={"comm_date": "date"})
    )
    if "stake" not in out.columns:
        out["stake"] = 0.0
    if "winnings" not in out.columns:
        out["winnings"] = 0.0
    return out.sort_values("date")
