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
Current version: **v14**

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
| 8 | 99-day transaction backfill extracted (Jan 1 – Apr 8 2026) |
| 9 | Transactions enabled on VM (`PLAYABETS_ENABLE_TRANSACTIONS=1`) |
| 10 | Scheduler fixed to use `incremental_transactions_simple` (not old row-level extractor) |
| 11 | API redeployed (v14) with NGR using `bonus_total` |
| 12 | Transaction queries updated: `ReasonID IN (...)` replaces slow JOIN |
| 13 | Deposits/Withdrawals forced to **Pending** in frontend until backfill corrected |

---

## ⚠️ Pending — Transactions Backfill

The 99-day backfill needs to be **re-run** with the corrected ReasonID filters.

**Previous runs used wrong filters** (included jackpot payouts, cancelled transactions, internal transfers). Numbers showed deposits ≈ withdrawals (~R800M each) which is incorrect.

**Correct deposit ReasonIDs:**
```
248, 249, 250, 830, 835, 839, 843, 851, 853, 855, 857, 859,
861, 863, 865, 867, 869, 871, 873, 875, 877, 939
```

**Correct withdrawal ReasonIDs:**
```
251, 252, 253, 254, 831, 833, 837, 841, 845, 847, 849
```

**To re-run backfill:**
```bash
# 1. Delete wrong files
del data\raw\transactions\transactions_daily_agg_backfill_20260101_20260408.parquet
# Also delete any partial 10-day test files (transactions_daily_agg_2026-03-*.parquet)

# 2. Run corrected backfill (local, VPN required, ~2-3 hours estimated without JOIN)
$env:BACKFILL_START="2026-01-01"; $env:BACKFILL_END="2026-04-08"; $env:WAIT_FOR_20="0"; python -m src.extract.backfill_transactions

# 3. SCP to VM
scp data/raw/transactions/transactions_daily_agg_backfill_20260101_20260408.parquet marilusmit@20.164.1.228:/mnt/playabets-data/raw/transactions/

# 4. Rebuild serving files on VM
SKIP_EXTRACT=1 python -m src.scheduler

# 5. Remove PENDING flag in frontend (useHomeData.ts)
# Change: setHasTransactionsData(false);
# Back to: setHasTransactionsData(Boolean(k.has_transactions_data));
# Then push → Vercel auto-deploys
```

---

## ❌ Outstanding Issues

### Data Accuracy
| # | Issue | Detail |
|---|-------|--------|
| 1 | **GGR gap** | Dashboard: R17.36M vs Client: R16.71M for March. Likely test users not excluded. Need `TestUser=0` filter on betslips extract (column not yet in COLUMNS list). |
| 2 | **Turnover gap** | Dashboard: R660M vs Client: R647M for March. Same root cause as GGR (test users). |
| 3 | **Sports Actives = 0** | ✅ Fixed — root cause was CreditType filter using numeric `== 1` but DWH stores string `"User Account"`. Fixed in `betslips_kpis.py`. Serving files rebuilt. |
| 4 | **Casino Actives = 0** | `actives_casino` not in `daily_kpis.parquet` — casino daily is a separate serving file. The Today panel fetches `/casino/daily` but the `casino_actives` or `actives` column may not be present in that endpoint's response. Investigate `build_domain_kpis.py` casino output columns. |
| 5 | **FTDs overcounting** | Dashboard shows 18,703 vs Client's 10,117 (FTD Total). FTD definition may differ — we count any first deposit in period, client may use different cohort logic. |
| 6 | **Conv Rate in Today panel** | Shows period conversion rate instead of today's rate. Fix: fetch today's FTDs alongside today's registrations. |
| 7 | **NGR formula** | Client wants: Real Money GGR − Bonus Redeemed (iSolutions field) − Taxes Paid By User. Need to identify exact field names in DWH. |
| 8 | **Bonus reversals** | `CancellationBonusTransazionID` not yet filtered. Client's bonus spend: R4,762,288 gross − R1,279,578 reversals = R3,482,710 net. |
| 9 | **Chart backgrounds on other pages** | Background styling needs to be updated on pages other than the Home/Executive Dashboard. Review all non-home pages for consistent chart background treatment. |

### Missing Data Extracts
| # | Item | Action needed |
|---|------|--------------|
| 1 | `TestUser` column | Add to `COLUMNS` in `incremental_betslips.py`, re-extract, add `TestUser=0` filter in `betslips_kpis.py` |
| 2 | Taxes Paid By User | Identify field in DWH, add to NGR calculation |
| 3 | Bonus reversals | Add `CancellationBonusTransazionID` filter to bonus KPIs |

### Frontend Charts (deferred — implement tomorrow)
| # | Chart | Change |
|---|-------|--------|
| 1 | Revenue Trends | Merge 3 separate charts (Turnover, GGR, Stake vs Revenue) into 1 with GGR/NGR/Turnover toggle |
| 2 | Player Acquisition | Change from Monthly bar chart to Daily bar chart |
| 3 | Conversion Rate Trend | Currently broken — replace with simple daily FTDs÷Registrations rate line |
| 4 | Sports vs Casino GGR | Add new bar chart (period totals, Sport vs Casino) |
| 5 | Segment Performance | Add horizontal tiles below donut chart (VIP, PVIP, Mass, New with counts and % of actives) |

### API / Backend (needs Docker rebuild + redeploy after changes)
| # | Change | Status |
|---|--------|--------|
| 1 | NGR formula update (taxes) | Pending DWH field confirmation |
| 2 | `has_transactions_data` re-enabled | After backfill complete and verified |

---

## FTD Definitions (clarification needed)

Client tracks two FTD metrics:
- **FTD Total** (~10,117 for March): Customers whose *first ever deposit* fell within the period. Standard acquisition metric.
- **FTD Reg Month** (~7,817 for March): Customers who *registered* in the period AND have ever deposited (lifetime). Conversion cohort metric.

**Current dashboard shows ~18,703** — likely counting all deposits from users who haven't deposited before in the *extract window*, not true lifetime FTDs. Needs investigation.

**Recommendation:** Show FTD Total as primary; Conv Rate = FTD Total ÷ Registrations.

---

## Questions for Client
1. Should **Jackpot Payouts** (ReasonIDs 945–1106) count as Deposits? They represent casino jackpot wins credited to player wallets, not player-initiated deposits.
2. Exact DWH field names for **Taxes Paid By User** and **Bonus Redeemed** for NGR calculation.
3. Is client's March figure (R16.71M GGR) for 1–30 or 1–31 March? Our 1–30 matches exactly.
4. Definition of **Active player** — confirmed as real money bet (CreditType=1). Sports Actives showing 0 needs investigation.
