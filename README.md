# Playa Bets Analytics

Data pipeline and analytics dashboard for Playa Bets. Extracts from the isbets
DWH (SQL Server), builds KPI parquet files, and serves them through a FastAPI
backend and a React dashboard.

## Repository layout

| Path | Purpose |
|---|---|
| `src/extract/` | Incremental extracts from DWH views to `data/raw/` parquet (watermark-based) |
| `src/kpis/` | KPI builders: daily KPIs, domain KPIs, RFM, churn, bonus, casino, VIP |
| `src/tools/` | Ad-hoc analysis and diagnostic scripts |
| `src/scheduler.py` | 2-hourly pipeline loop (extract -> KPI build) |
| `run_small_extracts.py` | CLI to run individual extracts and manage watermarks |
| `backend/` | FastAPI serving layer reading `data/serving/` parquet |
| `playabets-dashboard/` | React + Vite dashboard (Vercel deployment, Supabase-backed API routes) |
| `scripts/` | Operational helper scripts |
| `docs/` | Project and client documentation (see `docs/README.md`) |

## Data flow

```
DWH (SQL Server, via VPN)
  -> src/extract/*        incremental pulls, watermarked   -> data/raw/*.parquet
  -> src/kpis/*           daily + domain KPI builds        -> data/serving/*.parquet
  -> backend (FastAPI)    REST API over serving parquet
  -> playabets-dashboard  React UI (Vercel; demo path reads Supabase instead)
```

## Setup

Python 3.11+ and ODBC Driver 18 for SQL Server are required for the pipeline.

```bash
pip install -r requirements.txt
```

Required environment variables (pipeline):

```
DWH_SERVER     DWH hostname
DWH_PORT       default 1433
DWH_DATABASE   default isbets_bi
DWH_USER       SQL Server login
DWH_PASS       SQL Server password
```

Verify connectivity (VPN must be up): `python -m src.test_dwh_connection`

## Running the pipeline

```bash
python run_small_extracts.py --all    # run all extracts once
python -m src.kpis.build_daily_kpis   # build daily KPIs
python -m src.kpis.build_domain_kpis  # build domain KPIs
python -m src.scheduler               # continuous 2-hourly loop
```

`run_small_extracts.py` also takes individual module names and watermark
commands - see its module docstring.

## Backend API

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload    # docs at /docs
```

## Dashboard

```bash
cd playabets-dashboard
pnpm install
pnpm dev          # local dev
pnpm run check    # typecheck
pnpm build        # production build
```

Deployed on Vercel; `api/` routes read pre-loaded data from Supabase. See
`docs/deployment-architecture.md` for the full picture.
