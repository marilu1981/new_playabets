"""
build_domain_kpis.py
--------------------
Builds serving-domain parquet files:
  - transactions_daily.parquet
  - bonus_daily.parquet
  - ftd_daily.parquet
  - ftd_reg_month_daily.parquet
  - casino_daily.parquet
  - actives_monthly.parquet

Run from project root:
    python -m src.kpis.build_domain_kpis
"""
from __future__ import annotations

import pandas as pd

from src.app_config import ENABLE_TRANSACTIONS, RAW_ROOT, SERVING_ROOT
from .io_utils import read_all_parquets
from .transactions_kpi import compute_transactions_daily
from .bonus_kpis import compute_bonus_daily, compute_bonus_transactions_daily
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
            # Pre-aggregated files: prefer compacted full file + any new daily increments.
            full_file = tx_dir / "transactions_agg_full.parquet"
            agg_files = sorted(tx_dir.glob("transactions_daily_agg_*.parquet"))
            frames = []
            if full_file.exists():
                frames.append(pd.read_parquet(full_file))
            frames.extend(pd.read_parquet(f) for f in agg_files)
            if frames:
                tx_daily = pd.concat(frames, ignore_index=True)
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
                    "bonus_redeemed", "bonus_issued", "bonus_reversed", "bonus_net",
                ]:
                    if col not in tx_daily.columns:
                        tx_daily[col] = 0
                if "tx_count" not in tx_daily.columns:
                    tx_daily["tx_count"] = (
                        tx_daily.get("deposit_count", 0)
                        + tx_daily.get("withdrawal_count", 0)
                    )
                tx_daily.to_parquet(out, index=False)
                src_desc = f"full+{len(agg_files)} increments" if full_file.exists() else f"{len(agg_files)} increments"
                print(f"[domain_kpis] Transactions daily ({src_desc}): {len(tx_daily)} rows -> {out}")
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

    # Bonus — read full compacted file + any new increments (same pattern as transactions)
    bonus_dir = RAW / "bonus"
    if bonus_dir.exists():
        bonus_full = bonus_dir / "bonuses_full.parquet"
        bonus_increments = sorted(bonus_dir.glob("bonuses_increment_*.parquet"))
        bonus_frames = []
        if bonus_full.exists():
            bonus_frames.append(pd.read_parquet(bonus_full))
        bonus_frames.extend(pd.read_parquet(f) for f in bonus_increments)
        bonus_raw = pd.concat(bonus_frames, ignore_index=True) if bonus_frames else pd.DataFrame()
        src_desc = f"full+{len(bonus_increments)} increments" if bonus_full.exists() else f"{len(bonus_increments)} increments"
        print(f"[domain_kpis] Bonus raw ({src_desc}): {len(bonus_raw)} rows")
        campaigns_latest = bonus_dir / "campaigns_latest.parquet"
        campaigns_raw = pd.read_parquet(campaigns_latest) if campaigns_latest.exists() else pd.DataFrame()
        freebets_latest = bonus_dir / "freebets_latest.parquet"
        freebets_raw = pd.read_parquet(freebets_latest) if freebets_latest.exists() else pd.DataFrame()
        out = SERVING / "bonus_daily.parquet"
        # BonusTransactions (ReasonID 64=issued, 65=reversed) — client's Bonus Issued source
        bonus_tx_raw = read_all_parquets(bonus_dir, "bonus_transactions_increment_*.parquet")

        if bonus_raw.empty:
            print("[domain_kpis] Bonus raw is empty - keeping existing serving file")
        else:
            bonus_daily = compute_bonus_daily(bonus_raw, campaigns=campaigns_raw, freebets=freebets_raw)
            # Merge bonus transaction daily (Bonus Issued from view_BonusTransactions)
            if not bonus_tx_raw.empty:
                bonus_tx_daily = compute_bonus_transactions_daily(bonus_tx_raw)
                bonus_daily = bonus_daily.merge(bonus_tx_daily, on="date", how="outer").fillna(0)
                print(f"[domain_kpis] Bonus transactions daily merged: {len(bonus_tx_daily)} rows")
            bonus_daily.to_parquet(out, index=False)
            print(f"[domain_kpis] Bonus daily: {len(bonus_daily)} rows -> {out}")

            # Auto-compact: merge increments back into full file so folder stays clean
            if bonus_increments and not bonus_raw.empty and "BonusID" in bonus_raw.columns:
                sort_col = "InsertDate" if "InsertDate" in bonus_raw.columns else bonus_raw.columns[0]
                bonus_raw.sort_values(sort_col).drop_duplicates(
                    subset=["BonusID"], keep="last"
                ).to_parquet(bonus_full, index=False)
                for f in bonus_increments:
                    f.unlink()
                print(f"[domain_kpis] Bonus compacted: merged {len(bonus_increments)} increments → bonuses_full.parquet")
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

    # Casino (horse racing split into separate columns via compute_casino_daily)
    casino_dir = RAW / "casino"
    casino_raw = pd.DataFrame()
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

    # FTD Reg Month — users who registered in a period AND have ever deposited (lifetime).
    # Uses users_raw (registration dates) + ftd_raw (ever-deposited user IDs).
    # Output: one row per registration date with ftd_reg_month count.
    if ftd_dir.exists() and (ftd_dir / "first_deposits_full.parquet").exists():
        ftd_for_reg = pd.read_parquet(ftd_dir / "first_deposits_full.parquet")
        users_dir = RAW / "users"
        users_for_reg = read_all_parquets(users_dir, "users_increment_*.parquet") if users_dir.exists() else pd.DataFrame()
        if not ftd_for_reg.empty and not users_for_reg.empty:
            from .io_utils import normalize_cols
            u, ucol = normalize_cols(users_for_reg)
            f, fcol = normalize_cols(ftd_for_reg)
            uid_col = ucol.get("userid")
            creation_col = ucol.get("creationdate")
            ftd_uid_col = fcol.get("idutente")
            if uid_col and creation_col and ftd_uid_col:
                u["_uid"] = pd.to_numeric(u[uid_col], errors="coerce")
                u["_date"] = pd.to_datetime(u[creation_col], errors="coerce").dt.date
                u = u.dropna(subset=["_uid", "_date"])
                # Remove test users
                test_col = ucol.get("testuser")
                if test_col:
                    u = u[pd.to_numeric(u[test_col], errors="coerce").fillna(0).astype(int) == 0]
                u = u.drop_duplicates(subset=["_uid"], keep="first")
                f["_uid"] = pd.to_numeric(f[ftd_uid_col], errors="coerce")
                ever_deposited = set(f["_uid"].dropna().astype(int).tolist())
                u["has_ftd"] = u["_uid"].astype(int).isin(ever_deposited)
                reg_month = (
                    u[u["has_ftd"]]
                    .groupby("_date")["_uid"]
                    .nunique()
                    .reset_index()
                    .rename(columns={"_date": "date", "_uid": "ftd_reg_month"})
                )
                reg_month["ftd_reg_month"] = reg_month["ftd_reg_month"].astype(int)
                out_reg = SERVING / "ftd_reg_month_daily.parquet"
                reg_month.to_parquet(out_reg, index=False)
                print(f"[domain_kpis] FTD Reg Month daily: {len(reg_month)} rows -> {out_reg}")
            else:
                print("[domain_kpis] FTD Reg Month: missing required columns - skipping")
        else:
            print("[domain_kpis] FTD Reg Month: users or FTD data empty - skipping")
    else:
        print("[domain_kpis] FTD Reg Month: no FTD full snapshot - skipping")

    # Actives Monthly Unique — period-total unique users who placed real-money bets.
    # Sports: from raw betslips (CreditType == "User Account").
    # Casino: from raw casino (no credit type filter — all casino bets counted).
    actives_rows = []
    betslips_dir = RAW / "betslips"
    if betslips_dir.exists():
        from .io_utils import normalize_cols as _nc
        bs_raw = read_all_parquets(betslips_dir, "betslips*.parquet")
        if not bs_raw.empty:
            bs, bscol = _nc(bs_raw)
            uid_c = bscol.get("userid")
            date_c = bscol.get("placementdate")
            credit_c = bscol.get("credittype")
            if uid_c and date_c:
                if credit_c:
                    bs = bs[bs[credit_c].astype(str) == "User Account"]
                bs["_dt"] = pd.to_datetime(bs[date_c], errors="coerce")
                bs["_month"] = bs["_dt"].dt.to_period("M")
                sports_monthly = (
                    bs.dropna(subset=["_dt"])
                    .groupby("_month")[uid_c]
                    .nunique()
                    .reset_index()
                    .rename(columns={uid_c: "sports_actives_unique"})
                )
                sports_monthly["month"] = sports_monthly["_month"].astype(str)
                sports_monthly = sports_monthly[["month", "sports_actives_unique"]]
                actives_rows.append(sports_monthly)
    if not casino_raw.empty:
        from .io_utils import normalize_cols as _nc2
        ca, cacol = _nc2(casino_raw)
        uid_c = cacol.get("userid")
        date_c = cacol.get("placementdate")
        if uid_c and date_c:
            ca["_dt"] = pd.to_datetime(ca[date_c], errors="coerce")
            ca["_month"] = ca["_dt"].dt.to_period("M")
            casino_monthly = (
                ca.dropna(subset=["_dt"])
                .groupby("_month")[uid_c]
                .nunique()
                .reset_index()
                .rename(columns={uid_c: "casino_actives_unique"})
            )
            casino_monthly["month"] = casino_monthly["_month"].astype(str)
            casino_monthly = casino_monthly[["month", "casino_actives_unique"]]
            actives_rows.append(casino_monthly)

    if actives_rows:
        all_months: pd.DataFrame = actives_rows[0]
        for extra in actives_rows[1:]:
            all_months = all_months.merge(extra, on="month", how="outer")
        all_months = all_months.fillna(0)
        for col in ["sports_actives_unique", "casino_actives_unique"]:
            if col in all_months.columns:
                all_months[col] = all_months[col].astype(int)
        out_act = SERVING / "actives_monthly.parquet"
        all_months.to_parquet(out_act, index=False)
        print(f"[domain_kpis] Actives monthly unique: {len(all_months)} rows -> {out_act}")
    else:
        print("[domain_kpis] Actives monthly: no data - skipping")

    # Total Actives Monthly — union of sports and casino UserIDs (no double counting).
    # Players active in both sports and casino are counted once.
    try:
        sports_month_users: dict = {}
        casino_month_users: dict = {}
        betslips_dir2 = RAW / "betslips"
        if betslips_dir2.exists():
            from .io_utils import normalize_cols as _nc_ta
            bs_ta_raw = read_all_parquets(betslips_dir2, "betslips*.parquet")
            if not bs_ta_raw.empty:
                bs_ta, bscol_ta = _nc_ta(bs_ta_raw)
                uid_ta = bscol_ta.get("userid")
                date_ta = bscol_ta.get("placementdate")
                credit_ta = bscol_ta.get("credittype")
                if uid_ta and date_ta:
                    if credit_ta:
                        bs_ta = bs_ta[bs_ta[credit_ta].astype(str) == "User Account"]
                    bs_ta["_dt"] = pd.to_datetime(bs_ta[date_ta], errors="coerce")
                    bs_ta["_month"] = bs_ta["_dt"].dt.to_period("M")
                    for period, grp in bs_ta.dropna(subset=["_dt"]).groupby("_month"):
                        sports_month_users[str(period)] = set(grp[uid_ta].dropna().astype(int).tolist())
        if not casino_raw.empty:
            from .io_utils import normalize_cols as _nc_ca2
            ca2, cacol2 = _nc_ca2(casino_raw)
            uid_ca2 = cacol2.get("userid")
            date_ca2 = cacol2.get("placementdate")
            if uid_ca2 and date_ca2:
                ca2["_dt"] = pd.to_datetime(ca2[date_ca2], errors="coerce")
                ca2["_month"] = ca2["_dt"].dt.to_period("M")
                for period, grp in ca2.dropna(subset=["_dt"]).groupby("_month"):
                    casino_month_users[str(period)] = set(grp[uid_ca2].dropna().astype(int).tolist())
        all_m = set(sports_month_users.keys()) | set(casino_month_users.keys())
        total_month_users: dict = {}
        total_act_rows = []
        for month in sorted(all_m):
            total = sports_month_users.get(month, set()) | casino_month_users.get(month, set())
            total_month_users[month] = total
            total_act_rows.append({"month": month, "total_actives_unique": len(total)})
        if total_act_rows:
            total_act_df = pd.DataFrame(total_act_rows)
            total_act_out = SERVING / "total_actives_monthly.parquet"
            total_act_df.to_parquet(total_act_out, index=False)
            print(f"[domain_kpis] Total actives monthly: {len(total_act_df)} rows -> {total_act_out}")

        # Churn — uses total actives (sports + casino union) not sports-only.
        # Sports-only churn over-counts: casino-only players look churned when they stop sports.
        months_sorted = sorted(total_month_users.keys())
        churn_rows = []
        for i in range(1, len(months_sorted)):
            prev_m, curr_m = months_sorted[i - 1], months_sorted[i]
            prev_set = total_month_users[prev_m]
            curr_set = total_month_users[curr_m]
            churned = len(prev_set - curr_set)
            prev_count = len(prev_set)
            churn_pct = round(churned / prev_count * 100, 1) if prev_count > 0 else 0.0
            churn_rows.append({
                "month": curr_m,
                "actives_prev_month": prev_count,
                "churned": churned,
                "churn_pct": churn_pct,
            })
        if churn_rows:
            churn_df = pd.DataFrame(churn_rows)
            churn_out = SERVING / "churn_monthly.parquet"
            churn_df.to_parquet(churn_out, index=False)
            print(f"[domain_kpis] Churn monthly: {len(churn_df)} rows -> {churn_out}")
    except Exception as e:
        print(f"[domain_kpis] Total actives/churn: error - {e}")

    # (Churn is now computed inside the Total Actives block above using sports+casino union)

    print("[domain_kpis] Done.")


if __name__ == "__main__":
    main()
