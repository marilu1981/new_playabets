from __future__ import annotations

from pathlib import Path
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
USERS_DIR = PROJECT_ROOT / "data" / "raw" / "users"
BETSLIPS_DIR = PROJECT_ROOT / "data" / "raw" / "betslips"
SERVING_DIR = PROJECT_ROOT / "data" / "serving"
OUT_PATH = SERVING_DIR / "daily_kpis.parquet"


def _read_all_parquets(folder: Path, pattern: str) -> pd.DataFrame:
    files = sorted(folder.glob(pattern))
    if not files:
        return pd.DataFrame()
    dfs = []
    for f in files:
        dfs.append(pd.read_parquet(f))
    return pd.concat(dfs, ignore_index=True)


def main() -> None:
    SERVING_DIR.mkdir(parents=True, exist_ok=True)

    # USERS (Registrations)
    users = _read_all_parquets(USERS_DIR, "users_increment_*.parquet")
    if users.empty:
        raise FileNotFoundError(f"No user parquet files found in {USERS_DIR}")

    # Normalize column names (case-insensitive)
    users.columns = [c.strip() for c in users.columns]
    ucol = {c.lower(): c for c in users.columns}

    # Required fields from  view_users dictionary: UserID, CreationDate, TestUser
    user_id_col = ucol.get("userid")
    creation_col = ucol.get("creationdate")
    test_col = ucol.get("testuser")

    if not user_id_col or not creation_col:
        raise RuntimeError(f"Users parquet missing required columns. Found: {list(users.columns)}")

    # Parse registration date to date
    users["reg_date"] = pd.to_datetime(users[creation_col], errors="coerce").dt.date

    # Exclude test users if column exists (TestUser = 0)
    if test_col:
        users = users[users[test_col].fillna(0).astype(int) == 0]

    # Deduplicate users by UserID keeping earliest
    users["_reg_dt"] = pd.to_datetime(users[creation_col], errors="coerce")
    users = users.sort_values("_reg_dt").drop_duplicates(subset=[user_id_col], keep="first")

    registrations_daily = (
        users.dropna(subset=["reg_date"])
             .groupby("reg_date")[user_id_col]
             .nunique()
             .rename("registrations")
             .reset_index()
             .rename(columns={"reg_date": "date"})
    )

    # BETSLIPS (Actives, Turnover, GGR)
    betslips = _read_all_parquets(BETSLIPS_DIR, "betslips_increment_*.parquet")
    if betslips.empty:
        raise FileNotFoundError(f"No betslips parquet files found in {BETSLIPS_DIR}")

    betslips.columns = [c.strip() for c in betslips.columns]
    bcol = {c.lower(): c for c in betslips.columns}

    # From profile: betslipid, userid, placementdate, stake, winnings, betslipstatus, outcometype
    betslip_id_col = bcol.get("betslipid")
    bs_user_col = bcol.get("userid")
    placement_col = bcol.get("placementdate")
    stake_col = bcol.get("stake")
    winnings_col = bcol.get("winnings")

    if not betslip_id_col or not bs_user_col or not placement_col or not stake_col or not winnings_col:
        raise RuntimeError(f"Betslips parquet missing required columns. Found: {list(betslips.columns)}")

    # Deduplicate betslips by betslipid - keep latest record 
    # If __cursor__ exists, use it otherwise use placementdate 
    cursor_col = bcol.get("__cursor__")  # aliased to __cursor__ in incremental script
    if cursor_col:
        betslips["_ord"] = pd.to_datetime(betslips[cursor_col], errors="coerce")
    else:
        betslips["_ord"] = pd.to_datetime(betslips[placement_col], errors="coerce")

    betslips = betslips.sort_values("_ord").drop_duplicates(subset=[betslip_id_col], keep="last")

    betslips["activity_date"] = pd.to_datetime(betslips[placement_col], errors="coerce").dt.date

    # Ensure numeric
    betslips["stake_num"] = pd.to_numeric(betslips[stake_col], errors="coerce").fillna(0.0)
    betslips["winnings_num"] = pd.to_numeric(betslips[winnings_col], errors="coerce").fillna(0.0)

    sportsbook_daily = (
        betslips.dropna(subset=["activity_date"])
                .groupby("activity_date")
                .agg(
                    actives_sports=(bs_user_col, "nunique"),
                    turnover=("stake_num", "sum"),
                    winnings=("winnings_num", "sum"),
                )
                .reset_index()
                .rename(columns={"activity_date": "date"})
    )
    sportsbook_daily["ggr"] = sportsbook_daily["turnover"] - sportsbook_daily["winnings"]
    sportsbook_daily = sportsbook_daily.drop(columns=["winnings"])

    #  Combine daily KPI frame
    daily = pd.merge(registrations_daily, sportsbook_daily, on="date", how="outer").fillna(0)

    # Convert to correct dtypes
    daily["registrations"] = daily["registrations"].astype(int)
    daily["actives_sports"] = daily["actives_sports"].astype(int)
    for c in ["turnover", "ggr"]:
        daily[c] = daily[c].astype(float)

    # Sort
    daily = daily.sort_values("date")

    daily.to_parquet(OUT_PATH, index=False)
    print(f"Wrote {OUT_PATH} with {len(daily)} rows (daily).")


if __name__ == "__main__":
    main()
