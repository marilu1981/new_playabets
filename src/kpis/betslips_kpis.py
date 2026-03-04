from __future__ import annotations

import pandas as pd
from .io_utils import normalize_cols, ensure_cols, to_date, to_dt, to_num


SETTLED_STATUS = "Paid - Closed"   # from your sample pivot
OPEN_STATUS = "In Progress"        # from your sample pivot


def dedupe_betslips(betslips: pd.DataFrame) -> pd.DataFrame:
    """Deduplicate by betslipid using __cursor__ if present else placementdate."""
    betslips, bcol = normalize_cols(betslips)

    cols = ensure_cols(
        bcol,
        required_lower=["betslipid", "userid", "placementdate", "stake", "winnings"],
        context="Betslips",
    )

    betslip_id = cols["betslipid"]
    placement = cols["placementdate"]

    cursor_col = bcol.get("__cursor__")
    if cursor_col:
        betslips["_ord"] = to_dt(betslips[cursor_col])
    else:
        betslips["_ord"] = to_dt(betslips[placement])

    betslips = betslips.sort_values("_ord").drop_duplicates(subset=[betslip_id], keep="last")
    return betslips


def compute_betslips_daily_kpis(betslips: pd.DataFrame) -> pd.DataFrame:
    """
    Output columns (all by date):
      actives_sports (by placement date)
      betslips_count (by placement date)
      placed_stake (sum stake by placement date)
      open_exposure_stake (sum stake for In Progress by placement date)

      settled_stake (sum stake by payment date, status=Paid - Closed)
      settled_winnings (sum winnings by payment date, status=Paid - Closed)
      ggr (settled_stake - settled_winnings)
      hold_pct (ggr / settled_stake)

      win_rate (winning stake / settled_stake)  [settled only]
      cancel_rate (cancelled stake / settled_stake) [settled only]

      betslips_settled_count (count of settled betslips by payment date)
      betslips_won_count (count where OutcomeType=Winning, by payment date)
      betslips_cancelled_count (count where OutcomeType=Cancelled, by payment date)
    """
    if betslips.empty:
        return pd.DataFrame(columns=[
            "date",
            "actives_sports",
            "betslips_count",
            "placed_stake",
            "open_exposure_stake",
            "settled_stake",
            "settled_winnings",
            "ggr",
            "hold_pct",
            "win_rate",
            "cancel_rate",
            "betslips_settled_count",
            "betslips_won_count",
            "betslips_cancelled_count",
        ])

    betslips = dedupe_betslips(betslips)
    betslips, bcol = normalize_cols(betslips)

    cols = ensure_cols(
        bcol,
        required_lower=["userid", "placementdate", "stake", "winnings"],
        context="Betslips",
    )
    user_id = cols["userid"]
    placement = cols["placementdate"]
    stake = cols["stake"]
    winnings = cols["winnings"]

    status_col = bcol.get("betslipstatus")
    outcome_col = bcol.get("outcometype")
    payment_col = bcol.get("paymentdate")  # you do have this in your head()

    betslips["stake_num"] = to_num(betslips[stake], default=0.0)
    betslips["winnings_num"] = to_num(betslips[winnings], default=0.0)

    # --- Placement-date daily (activity / volume / exposure)
    betslips["place_date"] = to_date(betslips[placement])

    placed_daily = (
        betslips.dropna(subset=["place_date"])
                .groupby("place_date")
                .agg(
                    actives_sports=(user_id, "nunique"),
                    betslips_count=(user_id, "size"),
                    placed_stake=("stake_num", "sum"),
                )
                .reset_index()
                .rename(columns={"place_date": "date"})
    )

    # Open exposure (only if status col exists)
    if status_col:
        open_mask = betslips[status_col].astype(str).eq(OPEN_STATUS)
        open_daily = (
            betslips.loc[open_mask]
                   .dropna(subset=["place_date"])
                   .groupby("place_date")["stake_num"]
                   .sum()
                   .rename("open_exposure_stake")
                   .reset_index()
                   .rename(columns={"place_date": "date"})
        )
    else:
        open_daily = pd.DataFrame(columns=["date", "open_exposure_stake"])

    # --- Settlement-date daily (revenue truth)
    if payment_col and status_col:
        betslips["pay_date"] = to_date(betslips[payment_col])

        settled = betslips[betslips[status_col].astype(str).eq(SETTLED_STATUS)].copy()

        settled_daily = (
            settled.dropna(subset=["pay_date"])
                   .groupby("pay_date")
                   .agg(
                       settled_stake=("stake_num", "sum"),
                       settled_winnings=("winnings_num", "sum"),
                   )
                   .reset_index()
                   .rename(columns={"pay_date": "date"})
        )
        settled_daily["ggr"] = settled_daily["settled_stake"] - settled_daily["settled_winnings"]
        settled_daily["hold_pct"] = settled_daily.apply(
            lambda r: (r["ggr"] / r["settled_stake"]) if r["settled_stake"] else 0.0,
            axis=1,
        )

        # Win & Cancel rates use outcome type if available
        if outcome_col:
            win_stake = (
                settled[settled[outcome_col].astype(str).eq("Winning")]
                .dropna(subset=["pay_date"])
                .groupby("pay_date")["stake_num"].sum()
                .rename("winning_stake")
                .reset_index()
                .rename(columns={"pay_date": "date"})
            )
            cancel_stake = (
                settled[settled[outcome_col].astype(str).eq("Cancelled")]
                .dropna(subset=["pay_date"])
                .groupby("pay_date")["stake_num"].sum()
                .rename("cancelled_stake")
                .reset_index()
                .rename(columns={"pay_date": "date"})
            )

            # Count-based status columns (more accurate than stake-rate approximations)
            won_counts = (
                settled[settled[outcome_col].astype(str).eq("Winning")]
                .dropna(subset=["pay_date"])
                .groupby("pay_date")
                .size()
                .rename("betslips_won_count")
                .reset_index()
                .rename(columns={"pay_date": "date"})
            )
            cancel_counts = (
                settled[settled[outcome_col].astype(str).eq("Cancelled")]
                .dropna(subset=["pay_date"])
                .groupby("pay_date")
                .size()
                .rename("betslips_cancelled_count")
                .reset_index()
                .rename(columns={"pay_date": "date"})
            )
            settled_counts = (
                settled.dropna(subset=["pay_date"])
                .groupby("pay_date")
                .size()
                .rename("betslips_settled_count")
                .reset_index()
                .rename(columns={"pay_date": "date"})
            )

            settled_daily = (
                settled_daily
                .merge(win_stake, on="date", how="left")
                .merge(cancel_stake, on="date", how="left")
                .merge(won_counts, on="date", how="left")
                .merge(cancel_counts, on="date", how="left")
                .merge(settled_counts, on="date", how="left")
            )
            settled_daily[["winning_stake", "cancelled_stake"]] = settled_daily[["winning_stake", "cancelled_stake"]].fillna(0.0)
            settled_daily[["betslips_won_count", "betslips_cancelled_count", "betslips_settled_count"]] = (
                settled_daily[["betslips_won_count", "betslips_cancelled_count", "betslips_settled_count"]].fillna(0).astype(int)
            )

            settled_daily["win_rate"] = settled_daily.apply(
                lambda r: (r["winning_stake"] / r["settled_stake"]) if r["settled_stake"] else 0.0,
                axis=1,
            )
            settled_daily["cancel_rate"] = settled_daily.apply(
                lambda r: (r["cancelled_stake"] / r["settled_stake"]) if r["settled_stake"] else 0.0,
                axis=1,
            )

            settled_daily = settled_daily.drop(columns=["winning_stake", "cancelled_stake"])
        else:
            settled_daily["win_rate"] = 0.0
            settled_daily["cancel_rate"] = 0.0
            settled_daily["betslips_won_count"] = 0
            settled_daily["betslips_cancelled_count"] = 0
            settled_daily["betslips_settled_count"] = 0

    else:
        # If you don’t have paymentdate or betslipstatus, we can’t compute settled metrics reliably
        settled_daily = pd.DataFrame(columns=[
            "date", "settled_stake", "settled_winnings", "ggr", "hold_pct", "win_rate", "cancel_rate"
        ])

    # --- Combine
    # Keep both placement and settlement calendars; otherwise settlement-only dates
    # disappear and revenue can be understated on those days.
    out = placed_daily.merge(open_daily, on="date", how="outer").merge(settled_daily, on="date", how="outer")
    out = out.fillna(0)

    # Dtypes
    out["actives_sports"] = out["actives_sports"].astype(int)
    out["betslips_count"] = out["betslips_count"].astype(int)
    for c in ["placed_stake", "open_exposure_stake", "settled_stake", "settled_winnings", "ggr", "hold_pct", "win_rate", "cancel_rate"]:
        out[c] = out[c].astype(float)
    for c in ["betslips_settled_count", "betslips_won_count", "betslips_cancelled_count"]:
        out[c] = out[c].fillna(0).astype(int)

    return out.sort_values("date")
