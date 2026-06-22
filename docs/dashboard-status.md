# Playa Bets Dashboard — Status & Outstanding Issues

**Last updated:** 2026-04-10 (evening)

---

## Tech Stack

### Infrastructure
| Component | Technology | Location |
|-----------|-----------|----------|
| Pipeline / Scheduler | Python 3.12, pandas, SQLAlchemy | Azure VM (`marilusmit@20.164.1.228`) |
| API | FastAPI + uvicorn, Python 3.12 | Azure Container App (`playabets-api`, `rg-dashboard-vpn`) |
| Frontend | React + TypeScript, Vite, Tailwind, Recharts | Vercel (auto-deploy on push to `main`) |
| Storage | Azure Files (`stplayabetsprod01` → `/mnt/playabets-data/`) | Shared between VM and Container App |
| Container Registry | Azure Container Registry (`acrplayabetsprod01.azurecr.io`) | — |
| Source Control | GitHub (`marilu1981/new_playabets`) | Branch: `main` |

### Data Source
- **DWH**: SQL Server (`Dwh_en` schema), iSolutions platform
- **Timezone**: All DWH timestamps in **UTC** — dashboard converts to **SAST (UTC+2)**
- **VPN required** for DWH access (OpenVPN, config in `docs/downloaded-client-config.ovpn`)

### Pipeline Flow
```
DWH (SQL Server)
  → Extract (incremental parquets → Azure Files /raw/)
  → Transform (build_daily_kpis + build_domain_kpis → /serving/)
  → API (FastAPI reads /serving/ parquets, mtime-cached)
  → Frontend (Vercel → API calls)
```

### Key Environment Variables (VM: `~/playabets.env`)
| Variable | Value | Purpose |
|----------|-------|---------|
| `PLAYABETS_ENABLE_TRANSACTIONS` | `1` | Gates all transaction extraction/KPI code |
| `DWH_SERVER` | (set) | SQL Server host |
| `DWH_USER` / `DWH_PASS` | (set) | DWH credentials |
| `WAIT_FOR_20` | `1` | Wait until :20 past hour before querying DWH |

### Scheduler
- Runs every **2 hours** via `run_pipeline.sh` (cron on VM)
- `SKIP_EXTRACT=1 python -m src.scheduler` — rebuild serving files only (no DWH queries)
- `SCHEDULER_RUN_ONCE=1` — run once and exit

---

## Deployment Commands

### API (backend changes)
```bash
az acr login --name acrplayabetsprod01
docker build -f infra/azure/Dockerfile -t acrplayabetsprod01.azurecr.io/playabets-api:latest -t acrplayabetsprod01.azurecr.io/playabets-api:vXX .
docker push acrplayabetsprod01.azurecr.io/playabets-api:latest
docker push acrplayabetsprod01.azurecr.io/playabets-api:vXX
az containerapp update --name playabets-api --resource-group rg-dashboard-vpn --image acrplayabetsprod01.azurecr.io/playabets-api:vXX
```
Current version: **v15**

### Frontend (any client/ change)
Push to `main` → Vercel auto-deploys. No manual action needed.

### Pipeline (VM)
```bash
ssh marilusmit@20.164.1.228
cd ~/new_playabets && git pull
source ~/playabets/venv/bin/activate
# Full run (extract + transform):
python -m src.scheduler
# Transform only (no DWH queries):
SKIP_EXTRACT=1 python -m src.scheduler
```

---

## ✅ Completed

| # | Item |
|---|------|
| 1 | Full number formatting (1,000,000 not 1M) in all KPI tiles |
| 2 | SAST timezone fix — `to_date()` now shifts UTC+2h before date extraction |
| 3 | CreditType=1 filter on betslips (real money bets only for GGR/Actives) |
| 4 | Horse Racing bucketing — Betmakers providers → "Horse Racing" category |
| 5 | Free bets (FreeBetStatusId=2) included in bonus spend |
| 6 | Net Cash % tile added to Period KPIs |
| 7 | Data Connected status fixed (was hardcoded) |
| 8 | 99-day transaction backfill extracted (Jan 1 – Apr 8 2026) with correct ReasonID filters |
| 9 | Transactions enabled on VM (`PLAYABETS_ENABLE_TRANSACTIONS=1`) |
| 10 | Scheduler fixed to use `incremental_transactions_simple` (not old row-level extractor) |
| 11 | API redeployed (v14) with NGR using `bonus_total` |
| 12 | Transaction queries updated: `ReasonID IN (...)` replaces slow JOIN |
| 13 | Transactions live — PENDING flag removed from frontend |
| 14 | FTD overcounting fixed — extract now uses `MIN(dataprimodeposito) per user` (full refresh, not incremental per causale). March FTDs: 19,577 → 10,553 (client: 10,117) ✓ |
| 15 | Security vulnerabilities patched — vite 7.3.2, axios 1.15.0, vitest 4.1.4 |
| 16 | Backfill connection resilience — engine rebuilt after TCP drop so failures don't cascade |
| 17 | All pages white card theme — consistent with home dashboard |
| 18 | KpiCard standardised — text-sm value, green top bar, #f5f9f5 bg |
| 19 | Today panel Conv Rate — now shows today's FTDs ÷ today's registrations (was period rate) |

---

## ⚠️ Next Session — Pick Up From Here

### Step 1 — Verify transactions live on dashboard
After the 18:41 UTC VM scheduler run completes, check that Deposits and Withdrawals show real values (not "Pending") on the home dashboard. Expected: ~R377M deposits, ~R317M withdrawals for Jan–Apr range.

### Step 2 — Run failed backfill days (16 days)
The backfill completed 73/89 days. 16 days (Mar 24 – Apr 8) failed due to TCP drop. The backfill script is now fixed (rebuilds engine after TCP drop). Re-run locally:
```powershell
$env:BACKFILL_START="2026-03-24"; $env:BACKFILL_END="2026-04-08"; $env:WAIT_FOR_20="0"; python -m src.extract.backfill_transactions
```
Then re-run `scripts/merge_transactions.py` and SCP the updated serving file to VM.

### Step 3 — Frontend charts (in order)
| # | Chart | Change |
|---|-------|--------|
| Chart 3 | Conversion Rate Trend | Replace broken chart with daily FTDs÷Regs line |
| Chart 1 | Revenue Trends | Merge 3 charts into 1 with GGR/NGR/Turnover toggle |
| Chart 2 | Player Acquisition | Switch monthly → daily bar chart |
| Chart 4 | Sports vs Casino GGR | New bar chart (period totals) |
| Chart 5 | Segment tiles | Horizontal tiles below donut (VIP, PVIP, Mass, New) |

---

## ❌ Outstanding Issues

### Data Accuracy
| # | Issue | Detail |
|---|-------|--------|
| 1 | **GGR gap** | Dashboard: R17.36M vs Client: R16.71M for March. Likely test users not excluded. Need `TestUser=0` filter on betslips extract (column not yet in COLUMNS list). |
| 2 | **Turnover gap** | Dashboard: R660M vs Client: R647M for March. Same root cause as GGR (test users). |
| 3 | **Casino Actives = 0 (Today)** | Data availability — populates after next scheduler run with casino extract. No code fix needed. |
| 4 | **Conv Rate Trend chart** | Currently broken — needs replacement with daily FTDs÷Regs line (next session). |
| 5 | **NGR formula** | Client wants: Real Money GGR − Bonus Redeemed (iSolutions field) − Taxes Paid By User. Need to identify exact field names in DWH. |
| 6 | **Bonus reversals** | `CancellationBonusTransazionID` not yet filtered. Client's bonus spend: R4,762,288 gross − R1,279,578 reversals = R3,482,710 net. |

### Missing Data Extracts
| # | Item | Action needed |
|---|------|--------------|
| 1 | `TestUser` column | Add to `COLUMNS` in `incremental_betslips.py`, re-extract, add `TestUser=0` filter in `betslips_kpis.py` |
| 2 | Taxes Paid By User | Identify field in DWH, add to NGR calculation |
| 3 | Bonus reversals | Add `CancellationBonusTransazionID` filter to bonus KPIs |

### API / Backend (needs Docker rebuild + redeploy after changes)
| # | Change | Status |
|---|--------|--------|
| 1 | NGR formula update (taxes) | Pending DWH field confirmation |

---

## FTD Definitions

Client tracks two FTD metrics:
- **FTD Total** (~10,117 for March): Customers whose *first ever deposit* fell within the period. Standard acquisition metric. ✅ Dashboard now shows ~10,553 — close match.
- **FTD Reg Month** (~7,817 for March): Customers who *registered* in the period AND have ever deposited (lifetime). Conversion cohort metric. Not yet implemented.

**Conv Rate** = FTD Total ÷ Registrations (both period and today's).

---

## Questions for Client
1. Should **Jackpot Payouts** (ReasonIDs 945–1106) count as Deposits?
2. Exact DWH field names for **Taxes Paid By User** and **Bonus Redeemed** for NGR calculation.
3. Is client's March figure (R16.71M GGR) for 1–30 or 1–31 March?
