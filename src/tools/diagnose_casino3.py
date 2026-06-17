"""
diagnose_casino3.py
-------------------
Identifies "new" casino providers and checks whether Win% > 100%
is systematic (data format issue) or driven by individual big wins.

Run from project root:
    python -m src.tools.diagnose_casino3
"""
from __future__ import annotations

import os
from sqlalchemy import text
from src.extract.db_utils import build_engine

START = os.environ.get("DIAG_START", "2026-05-01")
END   = os.environ.get("DIAG_END",   "2026-05-30")
VIEW  = "Dwh_en.view_casino"


def main() -> None:
    engine = build_engine()
    with engine.connect() as conn:

        # ── 1. Provider first-seen date in view_casino ────────────────────
        print("\n" + "="*60)
        print("PROVIDER FIRST-SEEN DATE (all time)")
        print("="*60)
        fq = text(f"""
            SELECT
                ProviderName,
                MIN(CAST(PlacementDate AS DATE)) AS first_seen,
                MAX(CAST(PlacementDate AS DATE)) AS last_seen,
                COUNT(*) AS total_rows
            FROM {VIEW}
            GROUP BY ProviderName
            ORDER BY first_seen DESC
        """)
        try:
            frows = conn.execute(fq).fetchall()
            print(f"  {'Provider':<30} {'First Seen':>12} {'Last Seen':>12} {'Rows':>10}")
            print("  " + "-"*66)
            for r in frows:
                print(f"  {str(r[0] or 'NULL'):<30} {str(r[1]):>12} {str(r[2]):>12} {int(r[3] or 0):>10,}")
        except Exception as e:
            print(f"  Query failed: {e}")

        # ── 2. Per-provider Win% distribution: is it one user or systemic? ─
        print("\n" + "="*60)
        print(f"WIN% > 100% PROVIDERS: per-user breakdown ({START} to {END})")
        print("="*60)

        # Providers that showed Win% > 100% in May
        problem_providers = ["Hacksaw", "YGG", "Betsoft", "Spinomenal", "Blueprint"]

        for provider in problem_providers:
            pq = text(f"""
                SELECT
                    UserID,
                    COUNT(*)       AS sessions,
                    SUM(Stake)     AS total_stake,
                    SUM(Winnings)  AS total_winnings,
                    SUM(Stake) - SUM(Winnings) AS house_net
                FROM {VIEW}
                WHERE ProviderName LIKE '%{provider}%'
                  AND CAST(PlacementDate AS DATE) >= '{START}'
                  AND CAST(PlacementDate AS DATE) <= '{END}'
                GROUP BY UserID
                ORDER BY house_net ASC
            """)
            try:
                prows = conn.execute(pq).fetchall()
                total_s = sum(float(r[2] or 0) for r in prows)
                total_w = sum(float(r[3] or 0) for r in prows)
                negative_users = [r for r in prows if float(r[4] or 0) < 0]
                positive_users = [r for r in prows if float(r[4] or 0) >= 0]

                print(f"\n  {provider.upper()}")
                print(f"    Total users: {len(prows)}  |  "
                      f"Stake: {total_s:,.0f}  Winnings: {total_w:,.0f}  "
                      f"GGR: {total_s-total_w:,.0f}  Win%: {total_w/total_s*100:.1f}%")
                print(f"    Users where casino lost: {len(negative_users)}  |  "
                      f"Users where casino won: {len(positive_users)}")
                print(f"    Top 5 biggest winners (users):")
                for r in prows[:5]:
                    s = float(r[2] or 0)
                    w = float(r[3] or 0)
                    pct = w/s*100 if s > 0 else 0
                    print(f"      UserID {r[0]:>10}: Stake={s:>12,.0f}  "
                          f"Win={w:>12,.0f}  Net={float(r[4] or 0):>12,.0f}  WinPct={pct:.1f}%")
            except Exception as e:
                print(f"  {provider}: failed — {e}")

        # ── 3. Check ThirdpartiesStake vs Stake for problem providers ────
        print("\n" + "="*60)
        print(f"THIRDPARTIES vs STAKE comparison ({START} to {END})")
        print("(If ThirdpartiesStake ≠ Stake, data has two sources)")
        print("="*60)
        tq = text(f"""
            SELECT
                ProviderName,
                SUM(Stake)                        AS stake,
                SUM(Winnings)                     AS winnings,
                SUM(ThirdpartiesStake)            AS tp_stake,
                SUM(ThirdpartiesWinnings)         AS tp_winnings,
                SUM(Stake) - SUM(Winnings)        AS ggr,
                SUM(ThirdpartiesStake) - SUM(ThirdpartiesWinnings) AS tp_ggr
            FROM {VIEW}
            WHERE CAST(PlacementDate AS DATE) >= '{START}'
              AND CAST(PlacementDate AS DATE) <= '{END}'
            GROUP BY ProviderName
            ORDER BY ABS(SUM(Stake) - SUM(ThirdpartiesStake)) DESC
        """)
        try:
            trows = conn.execute(tq).fetchall()
            print(f"  {'Provider':<30} {'Stake':>14} {'TpStake':>14} {'Diff':>12}")
            print("  " + "-"*75)
            for r in trows:
                stk   = float(r[1] or 0)
                tpstk = float(r[3] or 0)
                diff  = stk - tpstk
                flag  = " *** MISMATCH ***" if abs(diff) > 1 else ""
                print(f"  {str(r[0] or 'NULL'):<30} {stk:>14,.0f} {tpstk:>14,.0f} {diff:>12,.0f}{flag}")
        except Exception as e:
            print(f"  Query failed: {e}")

        # ── 4. New providers (first appeared in 2026) — full May metrics ──
        print("\n" + "="*60)
        print(f"NEW PROVIDERS (first seen 2026) — May metrics")
        print("="*60)
        nq = text(f"""
            SELECT
                v.ProviderName,
                earliest.first_seen,
                SUM(v.Stake)    AS stake,
                SUM(v.Winnings) AS winnings,
                SUM(v.Stake) - SUM(v.Winnings) AS ggr
            FROM {VIEW} v
            JOIN (
                SELECT ProviderName, MIN(CAST(PlacementDate AS DATE)) AS first_seen
                FROM {VIEW}
                GROUP BY ProviderName
                HAVING MIN(CAST(PlacementDate AS DATE)) >= '2026-01-01'
            ) earliest ON v.ProviderName = earliest.ProviderName
            WHERE CAST(v.PlacementDate AS DATE) >= '{START}'
              AND CAST(v.PlacementDate AS DATE) <= '{END}'
            GROUP BY v.ProviderName, earliest.first_seen
            ORDER BY earliest.first_seen DESC
        """)
        try:
            nrows = conn.execute(nq).fetchall()
            if nrows:
                print(f"  {'Provider':<30} {'First Seen':>12} {'Stake':>14} "
                      f"{'Winnings':>14} {'GGR':>12} {'Win%':>8}")
                print("  " + "-"*95)
                for r in nrows:
                    s = float(r[2] or 0)
                    w = float(r[3] or 0)
                    ggr = float(r[4] or 0)
                    pct = w/s*100 if s > 0 else 0
                    flag = " *** Win%>100" if pct > 100 else ""
                    print(f"  {str(r[0] or 'NULL'):<30} {str(r[1]):>12} {s:>14,.0f} "
                          f"{w:>14,.0f} {ggr:>12,.0f} {pct:>7.1f}%{flag}")
            else:
                print("  No providers first seen in 2026.")
        except Exception as e:
            print(f"  Query failed: {e}")

        # ── 5. GGR if we exclude ALL new providers (first seen 2026) ─────
        print("\n" + "="*60)
        print(f"GGR COMPARISON: all vs excluding new-2026 providers ({START} to {END})")
        print("="*60)
        gq = text(f"""
            SELECT
                SUM(CASE WHEN earliest.first_seen >= '2026-01-01'
                         THEN v.Stake    ELSE 0 END) AS new_stake,
                SUM(CASE WHEN earliest.first_seen >= '2026-01-01'
                         THEN v.Winnings ELSE 0 END) AS new_winnings,
                SUM(CASE WHEN earliest.first_seen <  '2026-01-01'
                         THEN v.Stake    ELSE 0 END) AS old_stake,
                SUM(CASE WHEN earliest.first_seen <  '2026-01-01'
                         THEN v.Winnings ELSE 0 END) AS old_winnings,
                SUM(v.Stake)    AS total_stake,
                SUM(v.Winnings) AS total_winnings
            FROM {VIEW} v
            JOIN (
                SELECT ProviderName, MIN(CAST(PlacementDate AS DATE)) AS first_seen
                FROM {VIEW}
                GROUP BY ProviderName
            ) earliest ON v.ProviderName = earliest.ProviderName
            WHERE CAST(v.PlacementDate AS DATE) >= '{START}'
              AND CAST(v.PlacementDate AS DATE) <= '{END}'
              AND v.ProviderName NOT LIKE '%Betmakers%'
              AND v.ProviderName NOT LIKE '%Lotto%'
        """)
        try:
            g = conn.execute(gq).fetchone()
            ns  = float(g[0] or 0)
            nw  = float(g[1] or 0)
            os_ = float(g[2] or 0)
            ow  = float(g[3] or 0)
            ts  = float(g[4] or 0)
            tw  = float(g[5] or 0)
            print(f"  All providers:     Stake={ts:>14,.0f}  Win={tw:>14,.0f}  GGR={ts-tw:>12,.0f}")
            print(f"  New (2026+):       Stake={ns:>14,.0f}  Win={nw:>14,.0f}  GGR={ns-nw:>12,.0f}")
            print(f"  Old (pre-2026):    Stake={os_:>14,.0f}  Win={ow:>14,.0f}  GGR={os_-ow:>12,.0f}")
            print(f"\n  Client GGR target: 26,289,989")
        except Exception as e:
            print(f"  GGR split query failed: {e}")

    print("\n[diagnose_casino3] Done.")


if __name__ == "__main__":
    main()
