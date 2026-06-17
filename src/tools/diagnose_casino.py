"""
diagnose_casino.py
------------------
Investigates casino GGR discrepancy.
Dashboard shows R14.2M for May vs client's R26.3M.

Run from project root:
    python -m src.tools.diagnose_casino

Optional env overrides:
    DIAG_START=2026-05-01  DIAG_END=2026-05-30
"""
from __future__ import annotations

import os
from sqlalchemy import text
from src.extract.db_utils import build_engine

START = os.environ.get("DIAG_START", "2026-05-01")
END   = os.environ.get("DIAG_END",   "2026-05-30")

VIEW = "Dwh_en.view_casino"

# Client GGR from GlobalGamingReport.csv (Real column, May 1-30)
CLIENT_GGR = {
    "Pragmatic":      13_984_452,
    "Evolution":       2_347_628,
    "NoLimitCity":     2_472_347,
    "Hacksaw":         3_456_000,   # approximate from report
    "IGSpribe":        2_307_000,
    "RedTiger":          None,
    "Booming":           None,
}


def main() -> None:
    engine = build_engine()
    with engine.connect() as conn:

        # ── 1. Columns available in view_casino ───────────────────────────
        print("\n" + "="*60)
        print("COLUMNS in Dwh_en.view_casino")
        print("="*60)
        try:
            col_q = text("""
                SELECT COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = 'Dwh_en'
                  AND TABLE_NAME   = 'view_casino'
                ORDER BY ORDINAL_POSITION
            """)
            cols = conn.execute(col_q).fetchall()
            for c in cols:
                print(f"  {c[0]}  ({c[1]})")
        except Exception as e:
            print(f"  Column list failed (may be a view): {e}")

        # ── 2. Per-provider: all money columns summed for May ─────────────
        print("\n" + "="*60)
        print(f"PER-PROVIDER BREAKDOWN  ({START} to {END})")
        print("="*60)

        q = text(f"""
            SELECT
                ProviderName,
                COUNT(*)                AS rows_count,
                SUM(Stake)              AS total_stake,
                SUM(Winnings)           AS total_winnings,
                SUM(BonusStake)         AS total_bonus_stake,
                SUM(BonusWinnings)      AS total_bonus_winnings,
                SUM(Bonus)              AS total_bonus_credit,
                SUM(ThirdpartiesStake)  AS total_3p_stake,
                SUM(ThirdpartiesWinnings) AS total_3p_winnings,
                SUM(Jackpot)            AS total_jackpot,
                SUM(BetsNumber)         AS total_bets,
                COUNT(DISTINCT UserID)  AS unique_users
            FROM {VIEW}
            WHERE CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
              AND UserID NOT IN (
                  SELECT userid FROM Dwh_en.view_users WHERE testuser = 1
              )
            GROUP BY ProviderName
            ORDER BY total_stake DESC
        """)

        try:
            rows = conn.execute(q).fetchall()
        except Exception as e:
            print(f"Query failed: {e}")
            # Try without the testuser filter in case it's slow
            q2 = text(f"""
                SELECT
                    ProviderName,
                    COUNT(*)                AS rows_count,
                    SUM(Stake)              AS total_stake,
                    SUM(Winnings)           AS total_winnings,
                    SUM(BonusStake)         AS total_bonus_stake,
                    SUM(BonusWinnings)      AS total_bonus_winnings,
                    SUM(Bonus)              AS total_bonus_credit,
                    SUM(ThirdpartiesStake)  AS total_3p_stake,
                    SUM(ThirdpartiesWinnings) AS total_3p_winnings,
                    SUM(Jackpot)            AS total_jackpot,
                    SUM(BetsNumber)         AS total_bets,
                    COUNT(DISTINCT UserID)  AS unique_users
                FROM {VIEW}
                WHERE CAST(PlacementDate AS DATE) >= '{START}'
                  AND CAST(PlacementDate AS DATE) <= '{END}'
                GROUP BY ProviderName
                ORDER BY total_stake DESC
            """)
            rows = conn.execute(q2).fetchall()

        print(f"\n{'Provider':<25} {'Rows':>8} {'Stake':>14} {'Winnings':>14} "
              f"{'BonusStk':>12} {'BonusWin':>12} {'Bonus':>10} {'3pStk':>12} {'3pWin':>12}")
        print("-"*125)

        grand_s = grand_w = grand_bs = grand_bw = 0.0
        grand_alt1 = grand_alt2 = grand_alt3 = 0.0

        for r in rows:
            name  = str(r[0] or "NULL")
            rows_ = int(r[1] or 0)
            stk   = float(r[2] or 0)
            win   = float(r[3] or 0)
            bstk  = float(r[4] or 0)
            bwin  = float(r[5] or 0)
            bon   = float(r[6] or 0)
            t3s   = float(r[7] or 0)
            t3w   = float(r[8] or 0)

            grand_s   += stk
            grand_w   += win
            grand_bs  += bstk
            grand_bw  += bwin

            # GGR formulas
            ggr_current = stk - win                         # current: Stake - Winnings
            ggr_alt1    = stk - win + bstk                  # add BonusStake back
            ggr_alt2    = stk - (win - bwin)                # remove BonusWinnings from Winnings
            ggr_alt3    = (stk + bstk) - (win + bstk - bstk) # same as alt1 in effect

            grand_alt1 += ggr_alt1
            grand_alt2 += ggr_alt2
            grand_alt3 += ggr_current + bstk - bwin

            print(f"{name:<25} {rows_:>8,} {stk:>14,.0f} {win:>14,.0f} "
                  f"{bstk:>12,.0f} {bwin:>12,.0f} {bon:>10,.0f} {t3s:>12,.0f} {t3w:>12,.0f}")

        print("-"*125)
        print(f"\n{'GGR formula comparison':}")
        print(f"  Formula A (current):   Stake - Winnings                      = {grand_s-grand_w:>15,.0f}")
        print(f"  Formula B:             Stake - Winnings + BonusStake         = {grand_s-grand_w+grand_bs:>15,.0f}")
        print(f"  Formula C:             Stake - (Winnings - BonusWinnings)    = {grand_s-grand_w+grand_bw:>15,.0f}")
        print(f"  Formula D:             (Stake+BonusStake) - Winnings         = {grand_s+grand_bs-grand_w:>15,.0f}")
        print(f"  Formula E:             (Stake+BonusStake)-(Winnings-BonusWinnings) = {grand_s+grand_bs-grand_w+grand_bw:>15,.0f}")
        print(f"\n  Client GGR target:                                           =      26,289,989")
        print(f"  Our current dashboard:                                        =      14,214,901")
        print(f"  Gap:                                                          =      12,075,088")

        # ── 3. Top-10 rows for Hacksaw (spot check) ───────────────────────
        print("\n" + "="*60)
        print(f"HACKSAW: sample of 10 rows")
        print("="*60)
        q3 = text(f"""
            SELECT TOP 10
                CasinoID, UserID, CAST(PlacementDate AS DATE) AS dt,
                BetsNumber, Stake, Winnings, BonusStake, BonusWinnings,
                Bonus, InsertDate
            FROM {VIEW}
            WHERE ProviderName LIKE '%Hacksaw%'
              AND CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
            ORDER BY Stake DESC
        """)
        try:
            sample = conn.execute(q3).fetchall()
            print(f"{'CasinoID':>12} {'UserID':>10} {'Date':>12} {'Bets':>6} "
                  f"{'Stake':>12} {'Winnings':>12} {'BonusStk':>10} {'BonusWin':>10} {'Bonus':>10}")
            for row in sample:
                print(f"{row[0]:>12} {row[1]:>10} {str(row[2]):>12} {int(row[3] or 0):>6} "
                      f"{float(row[4] or 0):>12,.2f} {float(row[5] or 0):>12,.2f} "
                      f"{float(row[6] or 0):>10,.2f} {float(row[7] or 0):>10,.2f} {float(row[8] or 0):>10,.2f}")
        except Exception as e:
            print(f"Hacksaw sample failed: {e}")

        # ── 4. Hacksaw summary: are BonusWinnings in Winnings? ────────────
        print("\n" + "="*60)
        print(f"HACKSAW GGR FORMULA TEST")
        print("="*60)
        q4 = text(f"""
            SELECT
                SUM(Stake)         AS stk,
                SUM(Winnings)      AS win,
                SUM(BonusStake)    AS bstk,
                SUM(BonusWinnings) AS bwin,
                SUM(Stake) - SUM(Winnings)                        AS ggr_current,
                SUM(Stake) - SUM(Winnings) + SUM(BonusStake)     AS ggr_B,
                SUM(Stake) - (SUM(Winnings) - SUM(BonusWinnings)) AS ggr_C,
                (SUM(Stake)+SUM(BonusStake)) - SUM(Winnings)     AS ggr_D
            FROM {VIEW}
            WHERE ProviderName LIKE '%Hacksaw%'
              AND CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
        """)
        try:
            r4 = conn.execute(q4).fetchone()
            print(f"  Stake:            {float(r4[0] or 0):>15,.2f}")
            print(f"  Winnings:         {float(r4[1] or 0):>15,.2f}")
            print(f"  BonusStake:       {float(r4[2] or 0):>15,.2f}")
            print(f"  BonusWinnings:    {float(r4[3] or 0):>15,.2f}")
            print(f"  GGR A (current):  {float(r4[4] or 0):>15,.2f}  (Stake - Winnings)")
            print(f"  GGR B:            {float(r4[5] or 0):>15,.2f}  (Stake - Winnings + BonusStake)")
            print(f"  GGR C:            {float(r4[6] or 0):>15,.2f}  (Stake - (Winnings - BonusWinnings))")
            print(f"  GGR D:            {float(r4[7] or 0):>15,.2f}  ((Stake+BonusStake) - Winnings)")
            print(f"\n  Client Hacksaw GGR target: ~3,456,000")
        except Exception as e:
            print(f"Hacksaw formula test failed: {e}")

    print("\n[diagnose_casino] Done.")


if __name__ == "__main__":
    main()
