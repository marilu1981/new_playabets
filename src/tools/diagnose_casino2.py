"""
diagnose_casino2.py
-------------------
Deep-dive on user 5271600 (top Hacksaw player) and jackpot/big-winner
analysis to explain the -R5M Hacksaw GGR in May.

Run from project root:
    python -m src.tools.diagnose_casino2
"""
from __future__ import annotations

import os
from sqlalchemy import text
from src.extract.db_utils import build_engine

START = os.environ.get("DIAG_START", "2026-05-01")
END   = os.environ.get("DIAG_END",   "2026-05-30")
TARGET_USER = int(os.environ.get("TARGET_USER", "5271600"))

VIEW_CASINO = "Dwh_en.view_casino"
VIEW_USERS  = "Dwh_en.view_users"


def fmt(v) -> str:
    return f"{float(v or 0):>14,.2f}"


def main() -> None:
    engine = build_engine()
    with engine.connect() as conn:

        # ── 1. Who is user 5271600? ───────────────────────────────────────
        print("\n" + "="*60)
        print(f"USER PROFILE: {TARGET_USER}")
        print("="*60)
        uq = text(f"""
            SELECT TOP 1 *
            FROM {VIEW_USERS}
            WHERE userid = {TARGET_USER}
        """)
        try:
            urow = conn.execute(uq).fetchone()
            if urow:
                keys = urow._mapping.keys()
                for k in keys:
                    print(f"  {k}: {urow._mapping[k]}")
            else:
                print("  User not found in view_users")
        except Exception as e:
            print(f"  User lookup failed: {e}")

        # ── 2. Full Hacksaw P&L for user 5271600 in May ──────────────────
        print("\n" + "="*60)
        print(f"HACKSAW: ALL sessions for user {TARGET_USER} in May")
        print("="*60)
        hq = text(f"""
            SELECT
                CasinoID,
                CAST(PlacementDate AS DATE) AS dt,
                BetsNumber,
                Stake, Winnings, Jackpot,
                BonusStake, BonusWinnings,
                ThirdpartiesStake, ThirdpartiesWinnings,
                JackpotContribution, ThirdpartiesJackpotContribution
            FROM {VIEW_CASINO}
            WHERE UserID = {TARGET_USER}
              AND ProviderName LIKE '%Hacksaw%'
              AND CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
            ORDER BY Stake DESC
        """)
        try:
            hrows = conn.execute(hq).fetchall()
            total_stake = total_win = total_jackpot = 0.0
            print(f"  {'CasinoID':>10} {'Date':>12} {'Bets':>5} {'Stake':>14} "
                  f"{'Winnings':>14} {'Jackpot':>12} {'Net(House)':>14}")
            for row in hrows:
                s = float(row[3] or 0)
                w = float(row[4] or 0)
                j = float(row[5] or 0)
                net = s - w
                total_stake += s
                total_win   += w
                total_jackpot += j
                print(f"  {row[0]:>10} {str(row[1]):>12} {int(row[2] or 0):>5} "
                      f"{s:>14,.2f} {w:>14,.2f} {j:>12,.2f} {net:>14,.2f}")
            print(f"\n  TOTAL: Stake={total_stake:,.2f}  Winnings={total_win:,.2f}  "
                  f"Jackpot={total_jackpot:,.2f}  House Net={total_stake - total_win:,.2f}")
        except Exception as e:
            print(f"  Query failed: {e}")

        # ── 3. Hacksaw: top 20 winners (user-level GGR) in May ───────────
        print("\n" + "="*60)
        print(f"HACKSAW: top 20 USER NET (most expensive for house) — May")
        print("="*60)
        tq = text(f"""
            SELECT TOP 20
                UserID,
                SUM(Stake)    AS total_stake,
                SUM(Winnings) AS total_winnings,
                SUM(Stake) - SUM(Winnings) AS house_net,
                SUM(Jackpot)  AS total_jackpot,
                COUNT(*)      AS sessions
            FROM {VIEW_CASINO}
            WHERE ProviderName LIKE '%Hacksaw%'
              AND CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
            GROUP BY UserID
            ORDER BY house_net ASC  -- most negative first (biggest winners)
        """)
        try:
            trows = conn.execute(tq).fetchall()
            print(f"  {'UserID':>10} {'Stake':>14} {'Winnings':>14} {'HouseNet':>14} "
                  f"{'Jackpot':>12} {'Sessions':>8}")
            for r in trows:
                print(f"  {r[0]:>10} {float(r[1] or 0):>14,.0f} {float(r[2] or 0):>14,.0f} "
                      f"{float(r[3] or 0):>14,.0f} {float(r[4] or 0):>12,.0f} {int(r[5] or 0):>8}")
        except Exception as e:
            print(f"  Top winners query failed: {e}")

        # ── 4. Hacksaw GGR: with vs without user 5271600 ─────────────────
        print("\n" + "="*60)
        print(f"HACKSAW GGR: with vs without user {TARGET_USER}")
        print("="*60)
        gq = text(f"""
            SELECT
                SUM(Stake)    AS stk,
                SUM(Winnings) AS win,
                SUM(Jackpot)  AS jkp,
                SUM(CASE WHEN UserID = {TARGET_USER} THEN Stake    ELSE 0 END) AS user_stk,
                SUM(CASE WHEN UserID = {TARGET_USER} THEN Winnings ELSE 0 END) AS user_win,
                SUM(CASE WHEN UserID = {TARGET_USER} THEN Jackpot  ELSE 0 END) AS user_jkp
            FROM {VIEW_CASINO}
            WHERE ProviderName LIKE '%Hacksaw%'
              AND CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
        """)
        try:
            g = conn.execute(gq).fetchone()
            stk  = float(g[0] or 0)
            win  = float(g[1] or 0)
            jkp  = float(g[2] or 0)
            ustk = float(g[3] or 0)
            uwin = float(g[4] or 0)
            ujkp = float(g[5] or 0)

            rest_stk = stk - ustk
            rest_win = win - uwin

            print(f"  ALL users:          Stake={stk:>14,.0f}  Win={win:>14,.0f}  "
                  f"GGR={stk-win:>14,.0f}  Jackpot={jkp:>12,.0f}")
            print(f"  User {TARGET_USER}: Stake={ustk:>14,.0f}  Win={uwin:>14,.0f}  "
                  f"GGR={ustk-uwin:>14,.0f}  Jackpot={ujkp:>12,.0f}")
            print(f"  All EXCEPT user:    Stake={rest_stk:>14,.0f}  Win={rest_win:>14,.0f}  "
                  f"GGR={rest_stk-rest_win:>14,.0f}")
            print(f"\n  Client Hacksaw GGR target: ~3,600,000")
            print(f"  Our GGR excluding user {TARGET_USER}: {rest_stk-rest_win:,.0f}")
        except Exception as e:
            print(f"  With/without query failed: {e}")

        # ── 5. Pragmatic: same analysis — top big winners ─────────────────
        print("\n" + "="*60)
        print(f"PRAGMATIC: top 10 biggest winners for house (May)")
        print("="*60)
        pq = text(f"""
            SELECT TOP 10
                UserID,
                SUM(Stake)    AS total_stake,
                SUM(Winnings) AS total_winnings,
                SUM(Stake) - SUM(Winnings) AS house_net,
                SUM(Jackpot)  AS total_jackpot,
                COUNT(*)      AS sessions
            FROM {VIEW_CASINO}
            WHERE ProviderName LIKE '%Pragmatic%'
              AND CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
            GROUP BY UserID
            ORDER BY house_net ASC
        """)
        try:
            prows = conn.execute(pq).fetchall()
            print(f"  {'UserID':>10} {'Stake':>14} {'Winnings':>14} {'HouseNet':>14} "
                  f"{'Jackpot':>12} {'Sessions':>8}")
            for r in prows:
                print(f"  {r[0]:>10} {float(r[1] or 0):>14,.0f} {float(r[2] or 0):>14,.0f} "
                      f"{float(r[3] or 0):>14,.0f} {float(r[4] or 0):>12,.0f} {int(r[5] or 0):>8}")
        except Exception as e:
            print(f"  Pragmatic top winners failed: {e}")

        # ── 6. All-provider GGR excluding user 5271600 ───────────────────
        print("\n" + "="*60)
        print(f"ALL PROVIDERS: GGR excluding user {TARGET_USER}")
        print("="*60)
        aq = text(f"""
            SELECT
                SUM(Stake)    AS stk,
                SUM(Winnings) AS win,
                SUM(BonusStake) - SUM(BonusWinnings) AS bonus_ggr
            FROM {VIEW_CASINO}
            WHERE ProviderName NOT LIKE '%Betmakers%'
              AND ProviderName NOT LIKE '%Lotto%'
              AND CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
              AND UserID != {TARGET_USER}
              AND UserID NOT IN (
                  SELECT userid FROM {VIEW_USERS} WHERE testuser = 1
              )
        """)
        try:
            a = conn.execute(aq).fetchone()
            stk  = float(a[0] or 0)
            win  = float(a[1] or 0)
            bggr = float(a[2] or 0)
            print(f"  Stake:         {stk:>15,.0f}")
            print(f"  Winnings:      {win:>15,.0f}")
            print(f"  Real GGR:      {stk-win:>15,.0f}  (Stake - Winnings)")
            print(f"  Bonus GGR:     {bggr:>15,.0f}  (BonusStake - BonusWinnings)")
            print(f"  Total GGR:     {stk-win+bggr:>15,.0f}  (combined)")
            print(f"\n  Client total casino GGR target: 26,289,989")
        except Exception as e:
            print(f"  All-provider query failed: {e}")

    print("\n[diagnose_casino2] Done.")


if __name__ == "__main__":
    main()
