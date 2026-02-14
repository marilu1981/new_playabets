
# Do not run users_kpis.py directly - run python -m src.kpis.build_daily_kpis

from __future__ import annotations

import pandas as pd
from .io_utils import normalize_cols, ensure_cols, to_date, to_dt


def compute_registrations_daily(users: pd.DataFrame) -> pd.DataFrame:
    """
    Output columns:
      date, registrations
    """
    if users.empty:
        return pd.DataFrame(columns=["date", "registrations"])

    users, ucol = normalize_cols(users)

    cols = ensure_cols(
        ucol,
        required_lower=["userid", "creationdate"],
        context="Users",
    )
    user_id = cols["userid"]
    creation = cols["creationdate"]

    test_col = ucol.get("testuser")
    if test_col:
        users = users[users[test_col].fillna(0).astype(int) == 0]

    # Deduplicate users by earliest creation date
    users["_reg_dt"] = to_dt(users[creation])
    users = users.sort_values("_reg_dt").drop_duplicates(subset=[user_id], keep="first")

    users["date"] = to_date(users[creation])

    out = (
        users.dropna(subset=["date"])
             .groupby("date")[user_id]
             .nunique()
             .rename("registrations")
             .reset_index()
    )

    out["registrations"] = out["registrations"].astype(int)
    return out
