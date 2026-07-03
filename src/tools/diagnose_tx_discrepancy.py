"""
diagnose_tx_discrepancy.py
--------------------------
Finds the ReasonID sources of the Net Cash and FTD discrepancies vs the
client's GlobalGamingReport.

Run from project root:
    python -m src.tools.diagnose_tx_discrepancy

Output:
  1. All deposit ReasonIDs for the period, with amounts - highlights any
     ReasonID NOT in our current whitelist.
  2. All withdrawal + cancel-withdrawal ReasonIDs with amounts.
  3. FTD count under different causale filters.
"""
from __future__ import annotations

import os
from datetime import date
from sqlalchemy import text
from src.extract.db_utils import build_engine

# -- Date range to diagnose -------------------------------------------------
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

        # -- 1. Deposits by ReasonID -----------------------------------------
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

        # -- 2. Withdrawals by ReasonID --------------------------------------
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

        # -- 3. FTD analysis ----------------------------------------------------
        print("\n" + "="*60)
        print(f"FTD ANALYSIS  ({START} to {END})")
        print("="*60)

        # First: list columns in Stats.Transazioni_DepositiUtente
        print("\n--- Columns in Stats.Transazioni_DepositiUtente ---")
        try:
            col_q = text("""
                SELECT COLUMN_NAME, DATA_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = 'Stats'
                  AND TABLE_NAME   = 'Transazioni_DepositiUtente'
                ORDER BY ORDINAL_POSITION
            """)
            cols = conn.execute(col_q).fetchall()
            for c in cols:
                print(f"  {c[0]}  ({c[1]})")
        except Exception as e:
            print(f"  Column list failed: {e}")

        # Method A: current pipeline approach - MIN per user, count users in period
        q_ftd_current = text(f"""
            SELECT COUNT(*) AS ftds
            FROM (
                SELECT t.idutente, MIN(t.dataprimodeposito) AS first_dep
                FROM {FIRST_DEP_VIEW} t
                WHERE t.dataprimodeposito IS NOT NULL
                  AND t.idutente NOT IN (
                      SELECT userid FROM {USERS_VIEW} WHERE testuser = 1
                  )
                GROUP BY t.idutente
            ) sub
            WHERE sub.first_dep >= '{START}'
              AND sub.first_dep <= '{END}'
        """)

        # Method B: FTDs derived from view_transactions with our whitelist
        # (users whose first-ever whitelisted deposit is in the period)
        q_ftd_vt = text(f"""
            SELECT COUNT(*) AS ftds
            FROM (
                SELECT t.UserID, MIN(CAST(t.Date AS DATE)) AS first_dep
                FROM {VIEW} t
                WHERE t.TransactionAmountTypeID = 1
                  AND t.TransactionManagementStatusID = 3
                  AND t.ReasonID IN ({WHITELIST_STR})
                  AND t.UserID NOT IN (
                      SELECT userid FROM {USERS_VIEW} WHERE testuser = 1
                  )
                GROUP BY t.UserID
            ) sub
            WHERE sub.first_dep >= '{START}'
              AND sub.first_dep <= '{END}'
        """)

        print(f"\nTarget (client's figure):                    13,133")

        try:
            ftds_current = conn.execute(q_ftd_current).fetchone()[0]
            print(f"Method A - current (MIN per user, Transazioni_DepositiUtente): {ftds_current:,}")
        except Exception as e:
            print(f"Method A failed: {e}")
            ftds_current = None

        try:
            ftds_vt = conn.execute(q_ftd_vt).fetchone()[0]
            print(f"Method B - view_transactions with whitelist ReasonIDs:         {ftds_vt:,}")
        except Exception as e:
            print(f"Method B failed: {e}")
            ftds_vt = None

        # Method C: same as A but excluding users whose ONLY deposits were bonus types
        # (ReasonIDs 64, 65, 143 = bonus issued/reversed - if in Transazioni_DepositiUtente)
        print(f"\nNote: if Method B is closer to 13,133, switch FTD source to view_transactions")

    print("\n[diagnose] Done.")


if __name__ == "__main__":
    main()
