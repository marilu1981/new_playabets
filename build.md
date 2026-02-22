# Playa Bets Analytics Dashboard — Build Log

> Last updated: 2026-02-22 (Session 4)

---

## Project Structure

```
playabets/                    ← Python data pipeline (this repo)
  backend/
    app.py                    ← FastAPI REST API (all endpoints)
  src/
    extract/
      incremental_users.py
      incremental_betslips.py
      incremental_transactions.py  ← NEW
      incremental_bonus.py         ← NEW
      incremental_casino.py        ← NEW
      incremental_commissions.py   ← NEW
    kpis/
      io_utils.py
      users_kpis.py
      betslips_kpis.py
      transactions_kpi.py          ← NEW
      bonus_kpis.py                ← NEW
      casino_kpis.py               ← NEW
      commissions_kpis.py          ← NEW
      build_daily_kpis.py
      build_domain_kpis.py         ← NEW
    scheduler.py                   ← NEW (2-hourly pipeline runner)
  data/
    raw/
      users/
      betslips/
      transactions/                ← NEW
      bonus/                       ← NEW
      casino/                      ← NEW
      commissions/                 ← NEW
    serving/
      daily_kpis.parquet
      rfm_users.parquet
      rfm_rolling_daily.parquet
      transactions_daily.parquet   ← NEW
      bonus_daily.parquet          ← NEW
      casino_daily.parquet         ← NEW
      commissions_daily.parquet    ← NEW
    watermarks.db                  ← SQLite watermark store

playabets-dashboard/          ← React frontend (Vite + Tailwind 4)
  client/src/
    pages/
      Home.tsx                ← Overview (filters wired via useFilteredData)
      Sports.tsx
      Casino.tsx
      Transactions.tsx
      Bonus.tsx
      Commissions.tsx
      RFM.tsx
    components/
      TopFiltersBar.tsx       ← DashboardFilters type + defaultFilters
      DashboardLayout.tsx
      KpiCard.tsx
      StatusBadge.tsx
    hooks/
      useFilteredData.ts      ← NEW: filter-aware data hook (useMemo)
    lib/
      mockData.ts             ← All mock data (replace with API calls later)
      api.ts                  ← API client (inactive — VPN required)
      formatters.ts
```

---

## What Has Been Built

### Session 1 — Frontend Scaffold
- Initialized React + Tailwind 4 + shadcn/ui project (`playabets-dashboard`)
- Designed **Savanna Gold** dark theme (OKLCH color system)
- Built `DashboardLayout` with collapsible sidebar navigation
- Built `TopFiltersBar` with 13 filter controls (date range, granularity, brand, territory, country, traffic source, affiliate, segments, customer status, outlier filter)
- Built `KpiCard` and `StatusBadge` components
- Created all 7 dashboard pages with full chart layouts using Recharts:
  - **Home** (Executive Overview) — 12 KPI cards, 9 charts
  - **Sports** — Betslip status, top sports, bet types, application breakdown
  - **Casino** — Provider breakdown, casino types, daily GGR trend
  - **Transactions** — Deposit/withdrawal flow, net deposits trend
  - **Bonus** — Campaign overview, freebet summary, daily bonus trend
  - **Commissions** — Agent performance, commission trend, product split
  - **RFM** — Segment distribution, RFM scatter, rolling cohort chart
- Created comprehensive `mockData.ts` mirroring all DWH view structures

### Session 2 — Backend Python Pipeline
- Created `incremental_transactions.py` — pulls `Dwh_en.view_Transactions` incrementally via `DateVersion`
- Created `incremental_bonus.py` — pulls `view_BonusBonuses` (incremental), `view_BonusCampaigns` + `view_BonusFreebets` (full-refresh)
- Created `incremental_casino.py` — pulls `view_Casino` incrementally via `InsertDate`
- Created `incremental_commissions.py` — pulls all 4 commission views (full-refresh snapshots)
- Created `transactions_kpi.py` — transforms raw transactions to daily deposits/withdrawals
- Created `bonus_kpis.py` — daily bonus credited + campaign/freebet summary
- Created `casino_kpis.py` — daily casino GGR + by-provider + by-type breakdowns
- Created `commissions_kpis.py` — daily commission totals + top-agents summary
- Created `build_domain_kpis.py` — orchestrator that writes all domain serving Parquets
- Expanded `backend/app.py` to v0.2 with **all** REST endpoints:
  - `/health`, `/kpis`, `/timeseries/revenue`, `/timeseries/registrations`
  - `/kpis/latest`, `/kpis/series`, `/kpis/rolling`, `/kpis/daily`
  - `/rfm/segments`, `/rfm/users`
  - `/transactions/kpis`, `/transactions/trend`
  - `/bonus/kpis`, `/bonus/daily`, `/bonus/campaigns`
  - `/casino/kpis`, `/casino/daily`, `/casino/providers`, `/casino/types`
  - `/commissions/summary`, `/commissions/trend`
  - `/cache/clear`
- Created `scheduler.py` — 2-hourly pipeline runner (configurable via env vars)

### Session 4 — SQLAlchemy Migration + Quick-Start Extract Script
- **Migrated all 6 extract scripts** from raw `pyodbc` to `SQLAlchemy` (`mssql+pyodbc` dialect)
  - Removes the `UserWarning: pandas only supports SQLAlchemy connectable` warning
  - Parameterised queries now use named `:param` syntax (safer, more readable)
  - `PROJECT_ROOT` depth corrected from `parents[3]` → `parents[2]` in all scripts
  - `incremental_users.py` refactored from module-level execution into a proper `main()` function
  - All scripts now auto-create the `watermarks` table if it doesn't exist (no manual init needed)
- **Created `run_small_extracts.py`** — single convenience script to run extracts in order of size:
  - `python run_small_extracts.py` — runs Commissions → Bonus → Users → Casino → Transactions
  - `python run_small_extracts.py --all` — also runs Betslips (largest)
  - `python run_small_extracts.py --transform` — runs extracts + KPI transforms in one pass
  - Prints a summary table at the end showing which modules passed/failed

### Session 3 — Filter Wiring
- Created `useFilteredData.ts` hook — applies `DashboardFilters` to all mock data series using `useMemo`
- Wired hook into `Home.tsx` — all 14 chart data sources now respond to filter changes
- KPI scalars (totalStake, grossRevenue, deposits, etc.) derived from filtered data

---

## API Endpoints Reference

All endpoints served from `http://localhost:8080` when running locally with VPN.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check which serving files exist |
| `/kpis?start=&end=` | GET | Overview KPIs for date range |
| `/timeseries/revenue?start=&end=&metric=` | GET | Daily time-series |
| `/transactions/kpis?start=&end=` | GET | Deposit/withdrawal totals |
| `/transactions/trend?start=&end=` | GET | Daily deposit/withdrawal series |
| `/bonus/kpis` | GET | Campaign + freebet snapshot |
| `/bonus/daily?start=&end=` | GET | Daily bonus credited |
| `/bonus/campaigns?status=` | GET | Campaign list |
| `/casino/kpis?start=&end=` | GET | Casino GGR totals |
| `/casino/daily?start=&end=` | GET | Daily casino series |
| `/casino/providers` | GET | By-provider breakdown |
| `/casino/types` | GET | By-type breakdown |
| `/commissions/summary` | GET | Commission totals + top agents |
| `/commissions/trend?start=&end=` | GET | Daily commission series |
| `/rfm/segments` | GET | Segment counts |
| `/rfm/users?segment=&limit=` | GET | User list by segment |
| `/cache/clear` | POST | Clear in-memory Parquet cache |

---

## What You Need to Do on Your Local Machine

### 1. Install Python Dependencies

```bash
cd playabets
pip install -r requirements.txt
# Key packages: pyodbc, pandas, pyarrow, fastapi, uvicorn, apscheduler
```

### 2. Install ODBC Driver for SQL Server

```bash
# macOS
brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release
brew install msodbcsql18

# Ubuntu/Debian
curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -
curl https://packages.microsoft.com/config/ubuntu/22.04/prod.list > /etc/apt/sources.list.d/mssql-release.list
apt-get update && ACCEPT_EULA=Y apt-get install -y msodbcsql18
```

### 3. Set Environment Variables

```bash
export DWH_USER="your_sql_server_username"
export DWH_PASS="your_sql_server_password"
```

### 4. Initialize the Watermarks Database

```bash
cd playabets
python -c "
import sqlite3
from pathlib import Path
db = Path('data/watermarks.db')
db.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(db) as conn:
    conn.execute('''
        CREATE TABLE IF NOT EXISTS watermarks (
            view_name TEXT PRIMARY KEY,
            last_value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    ''')
    conn.commit()
print('watermarks.db initialized')
"
```

### 5. Connect to VPN and Run the Pipeline

```bash
# Connect to your VPN first, then:
cd playabets

# RECOMMENDED — run smallest extracts first to get data quickly:
python run_small_extracts.py

# With KPI transforms in one pass:
python run_small_extracts.py --transform

# Include betslips (largest table — leave for last):
python run_small_extracts.py --all --transform

# OR run individual modules:
python -m src.extract.incremental_commissions   # fastest — full-refresh, small tables
python -m src.extract.incremental_bonus         # campaigns + freebets + bonuses
python -m src.extract.incremental_users         # incremental via DateVersion
python -m src.extract.incremental_casino        # incremental via InsertDate
python -m src.extract.incremental_transactions  # incremental via DateVersion
python -m src.extract.incremental_betslips      # largest — run last
python -m src.kpis.build_daily_kpis
python -m src.kpis.build_domain_kpis

# OR run the scheduler (runs immediately, then every 2 hours):
python -m src.scheduler
```

### 6. Start the API Server

```bash
cd playabets
uvicorn backend.app:app --reload --port 8080
# API docs: http://localhost:8080/docs
```

### 7. Start the Frontend (Dev Mode)

```bash
cd playabets-dashboard
pnpm install
pnpm dev
# Frontend: http://localhost:3000
```

### 8. Wire Frontend to Real API

In `client/src/lib/api.ts`, change:
```typescript
const API_BASE = "http://localhost:8080";
const API_ENABLED = false;  // ← Change to true when VPN is connected
```

Then replace mock data calls in each page component with the corresponding API hook.

---

## DWH View → Extract Script Mapping

| DWH View | Extract Script | Cursor Column | Strategy |
|----------|---------------|---------------|----------|
| `Dwh_en.view_Users` | `incremental_users.py` | `DateVersion` | Incremental |
| `Dwh_en.view_BetSlips` | `incremental_betslips.py` | `DateVersion` | Incremental |
| `Dwh_en.view_Transactions` | `incremental_transactions.py` | `DateVersion` | Incremental |
| `Dwh_en.view_BonusBonuses` | `incremental_bonus.py` | `DateVersion` | Incremental |
| `Dwh_en.view_BonusCampaigns` | `incremental_bonus.py` | — | Full-refresh |
| `Dwh_en.view_BonusFreebets` | `incremental_bonus.py` | — | Full-refresh |
| `Dwh_en.view_Casino` | `incremental_casino.py` | `InsertDate` | Incremental |
| `Dwh_en.view_SportDirectCommissions` | `incremental_commissions.py` | — | Full-refresh |
| `Dwh_en.view_SportNetworkCommissions` | `incremental_commissions.py` | — | Full-refresh |
| `Dwh_en.view_CasinoDirectCommissions` | `incremental_commissions.py` | — | Full-refresh |
| `Dwh_en.view_CasinoNetworkCommissions` | `incremental_commissions.py` | — | Full-refresh |

---

## Scheduler Configuration

| Env Variable | Default | Description |
|---|---|---|
| `DWH_USER` | — | SQL Server username (required) |
| `DWH_PASS` | — | SQL Server password (required) |
| `SCHEDULE_INTERVAL_MINUTES` | `120` | Pipeline interval in minutes |
| `SKIP_EXTRACT` | `0` | Set to `1` to run transform only |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` |

---

## Next Steps

- [ ] Wire `api.ts` hooks into each page (replace mock data with real API calls)
- [ ] Apply `useFilteredData` hook to remaining pages (Sports, Casino, Transactions, Bonus, Commissions, RFM)
- [ ] Add `build_domain_kpis.py` to the scheduler's TRANSFORM_MODULES list (already done)
- [x] Migrate all extract scripts from pyodbc to SQLAlchemy (removes pandas warning)
- [x] Create `run_small_extracts.py` convenience script
- [ ] Test extract scripts against real DWH once VPN is available
- [ ] Add FTD (First-Time Depositor) logic to `transactions_kpi.py` (requires joining with Users view)
- [ ] Add NGR calculation (GGR − bonus_credited) to `build_daily_kpis.py`
- [ ] Consider adding Redis or file-based caching for the API if response times are slow
- [ ] Set up a `.env` file for local development (use `python-dotenv`)
