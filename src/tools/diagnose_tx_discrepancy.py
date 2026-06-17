"""
diagnose_tx_discrepancy.py
--------------------------
Finds the ReasonID sources of the Net Cash and FTD discrepancies vs the
client's GlobalGamingReport.

Run from project root:
    python -m src.tools.diagnose_tx_discrepancy

Output:
  1. All deposit ReasonIDs for the period, with amounts — highlights any
     ReasonID NOT in our current whitelist.
  2. All withdrawal + cancel-withdrawal ReasonIDs with amounts.
  3. FTD count under different causale filters.
"""
from __future__ import annotations

import os
from datetime import date
from sqlalchemy import text
from src.extract.db_utils import build_engine

# ── Date range to diagnose ─────────────────────────────────────────────────
START = os.environ.get("DIAG_START", "2026-05-01")
END   = os.environ.get("DIAG_END",   "2026-05-30")

# Our current whitelist
DEPOSIT_REASON_IDS = {
    249,250,830,835,839,843,851,853,855,857,859,
    861,863,865,867,869,871,877,939
}
WITHDRAWAL_REASON_IDS = {251,252,253,254,831,833,837,841,845,847,849,873,875}
CANCEL_WITHDRAWAL_REASON_IDS = {838,842,846,848,850}

VIEW = "Dwh_en.view_transactions"
FIRST_DEP_VIEW = "Stats.Transazioni_DepositiUtente"
USERS_VIEW = "Dwh_en.view_users"

WHITELIST_STR = ",".join(str(r) for r in sorted(DEPOSIT_REASON_IDS))


def main() -> None:
    s = f"{START} 00:00:00"
    e_dt = date.fromisoformat(END)
    from datetime import timedelta
    e = f"{(e_dt + timedelta(days=1)).isoformat()} 00:00:00"

    engine = build_engine()
    with engine.connect() as conn:

        # ── 1. Deposits by ReasonID ─────────────────────────────────────────
        print("\n" + "="*60)
        print(f"DEPOSITS by ReasonID  ({START} to {END})")
        print("="*60)
        q = text(f"""
            SELECT
                t.ReasonID,
                c.Causale                   AS reason_name,
                SUM(ABS(t.Amount))          AS total_amount,
                COUNT(*)                    AS tx_count
            FROM {VIEW} t
            LEFT JOIN Dwh.Causali c ON t.ReasonID = c.IDCausale
            WHERE t.Date >= '{s}'
              AND t.Date <  '{e}'
              AND t.TransactionAmountTypeID = 1
              AND t.TransactionManagementStatusID = 3
            GROUP BY t.ReasonID, c.Causale
            ORDER BY total_amount DESC
        """)
        rows = conn.execute(q).fetchall()
        total_in_wl = 0.0
        total_not_in_wl = 0.0
        print(f"{'ReasonID':>10}  {'Amount':>15}  {'Txns':>7}  {'In WL?':>6}  Name")
        print("-"*70)
        for r in rows:
            rid = int(r[0]) if r[0] is not None else 0
            name = str(r[1] or "?")
            amt = float(r[2] or 0)
            cnt = int(r[3] or 0)
            in_wl = rid in DEPOSIT_REASON_IDS
            flag = "YES" if in_wl else "*** NO ***"
            print(f"{rid:>10}  {amt:>15,.2f}  {cnt:>7,}  {flag:>10}  {name}")
            if in_wl:
                total_in_wl += amt
            else:
                total_not_in_wl += amt
        print("-"*70)
        print(f"{'TOTAL IN WHITELIST':>30}: {total_in_wl:>15,.2f}")
        print(f"{'TOTAL NOT IN WHITELIST':>30}: {total_not_in_wl:>15,.2f}")
        print(f"{'GRAND TOTAL':>30}: {total_in_wl + total_not_in_wl:>15,.2f}")

        # ── 2. Withdrawals by ReasonID ──────────────────────────────────────
        print("\n" + "="*60)
        print(f"WITHDRAWALS by ReasonID  ({START} to {END})")
        print("="*60)
        q2 = text(f"""
            SELECT
                t.ReasonID,
                c.Causale                   AS reason_name,
                SUM(ABS(t.Amount))          AS total_amount,
                COUNT(*)                    AS tx_count,
                CASE WHEN t.ReasonID IN ({','.join(str(r) for r in sorted(CANCEL_WITHDRAWAL_REASON_IDS))})
                     THEN 'CANCEL' ELSE 'WITHDRAWAL' END  AS kind
            FROM {VIEW} t
            LEFT JOIN Dwh.Causali c ON t.ReasonID = c.IDCausale
            WHERE t.Date >= '{s}'
              AND t.Date <  '{e}'
              AND t.TransactionAmountTypeID = 2
              AND t.TransactionManagementStatusID = 3
            GROUP BY t.ReasonID, c.Causale,
                     CASE WHEN t.ReasonID IN ({','.join(str(r) for r in sorted(CANCEL_WITHDRAWAL_REASON_IDS))})
                          THEN 'CANCEL' ELSE 'WITHDRAWAL' END
            ORDER BY total_amount DESC
        """)
        rows2 = conn.execute(q2).fetchall()
        all_wl = WITHDRAWAL_REASON_IDS | CANCEL_WITHDRAWAL_REASON_IDS
        total_wd_wl = 0.0
        total_cancel_wl = 0.0
        total_not_wl = 0.0
        print(f"{'ReasonID':>10}  {'Amount':>15}  {'Txns':>7}  {'Kind':>10}  {'In WL?':>6}  Name")
        print("-"*80)
        for r in rows2:
            rid = int(r[0]) if r[0] is not None else 0
            name = str(r[1] or "?")
            amt = float(r[2] or 0)
            cnt = int(r[3] or 0)
            kind = str(r[4] or "?")
            in_wl = rid in all_wl
            flag = "YES" if in_wl else "*** NO ***"
            print(f"{rid:>10}  {amt:>15,.2f}  {cnt:>7,}  {kind:>10}  {flag:>10}  {name}")
            if in_wl:
                if kind == "CANCEL":
                    total_cancel_wl += amt
                else:
                    total_wd_wl += amt
            else:
                total_not_wl += amt
        print("-"*80)
        print(f"{'NET WITHDRAWALS (wds - cancels)':>35}: {total_wd_wl - total_cancel_wl:>15,.2f}")
        print(f"{'EXTRA WITHDRAWALS (not in WL)':>35}: {total_not_wl:>15,.2f}")

        # ── 3. FTD count comparison ─────────────────────────────────────────
        print("\n" + "="*60)
        print(f"FTD COUNT COMPARISON  ({START} to {END})")
        print("="*60)

        # Our current query (all causali)
        q3a = text(f"""
            SELECT COUNT(DISTINCT t.idutente) AS ftds_all_causali
            FROM {FIRST_DEP_VIEW} t
            WHERE t.dataprimodeposito >= '{START}'
              AND t.dataprimodeposito <= '{END}'
              AND t.dataprimodeposito IS NOT NULL
              AND t.idutente NOT IN (
                  SELECT userid FROM {USERS_VIEW} WHERE testuser = 1
              )
        """)
        # With whitelist filter
        q3b = text(f"""
            SELECT COUNT(DISTINCT t.idutente) AS ftds_whitelist_only
            FROM {FIRST_DEP_VIEW} t
            WHERE t.dataprimodeposito >= '{START}'
              AND t.dataprimodeposito <= '{END}'
              AND t.dataprimodeposito IS NOT NULL
              AND t.causale IN ({WHITELIST_STR})
              AND t.idutente NOT IN (
                  SELECT userid FROM {USERS_VIEW} WHERE testuser = 1
              )
        """)
        # Count per causale (to understand breakdown)
        q3c = text(f"""
            SELECT
                t.causale,
                c.Causale AS reason_name,
                COUNT(DISTINCT t.idutente) AS unique_users,
                CASE WHEN t.causale IN ({WHITELIST_STR}) THEN 'YES' ELSE '*** NO ***' END AS in_whitelist
            FROM {FIRST_DEP_VIEW} t
            LEFT JOIN Dwh.Causali c ON t.causale = c.IDCausale
            WHERE t.dataprimodeposito >= '{START}'
              AND t.dataprimodeposito <= '{END}'
              AND t.dataprimodeposito IS NOT NULL
              AND t.idutente NOT IN (
                  SELECT userid FROM {USERS_VIEW} WHERE testuser = 1
              )
            GROUP BY t.causale, c.Causale,
                     CASE WHEN t.causale IN ({WHITELIST_STR}) THEN 'YES' ELSE '*** NO ***' END
            ORDER BY unique_users DESC
        """)

        try:
            ftds_all = conn.execute(q3a).fetchone()[0]
            print(f"FTDs (all causali, current behaviour):   {ftds_all:,}")
        except Exception as e:
            print(f"FTD all-causali query failed: {e}")
            print("  (column may be named differently — check Stats.Transazioni_DepositiUtente schema)")
            ftds_all = None

        try:
            ftds_wl = conn.execute(q3b).fetchone()[0]
            print(f"FTDs (whitelist causali only):            {ftds_wl:,}")
        except Exception as e:
            print(f"FTD whitelist query failed: {e}")
            ftds_wl = None

        print(f"\nTarget (client's figure): 13,133")
        if ftds_all: print(f"Current dashboard shows:  {ftds_all:,}")
        if ftds_wl:  print(f"With causale filter:      {ftds_wl:,}")

        print(f"\nFTD breakdown by causale:")
        print(f"{'Causale':>10}  {'Users':>8}  {'In WL?':>10}  Name")
        print("-"*60)
        try:
            for r in conn.execute(q3c).fetchall():
                print(f"{r[0]:>10}  {r[2]:>8,}  {r[3]:>10}  {r[1] or '?'}")
        except Exception as e:
            print(f"  FTD breakdown query failed: {e}")
            print("  (column names may differ — check schema)")

    print("\n[diagnose] Done.")


if __name__ == "__main__":
    main()
