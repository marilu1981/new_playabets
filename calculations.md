# Dashboard Calculations

This document describes how values are calculated in the **Executive Overview** dashboard (`Home.tsx`) for the current codebase.

Deployed in Vercel 

## Scope

- Page: `playabets-dashboard/client/src/pages/Home.tsx`
- Backend API: `backend/app.py`
- Serving parquet inputs:
  - `data/serving/daily_kpis.parquet` (sportsbook KPIs)
  - `data/serving/casino_daily.parquet` (casino KPIs)
  - `data/serving/bonus_daily.parquet` (bonus crediting)
  - `data/serving/ftd_daily.parquet` (FTD daily)
  - `data/serving/transactions_daily.parquet` (currently empty in your environment)

## Core Definitions

- `Sportsbook GGR = settled_stake - settled_winnings`
- `Casino GGR = casino_stake - casino_winnings`
- `Total Turnover = sportsbook settled_stake + casino_stake`
- `Total Winnings = sportsbook settled_winnings + casino_winnings`
- `Total GGR = sportsbook_ggr + casino_ggr`
- `NGR = Total GGR - bonus_credited`

## KPI Tiles

| Tile | Formula | Source |
|---|---|---|
| Registrations | Sum of registrations in selected date range | `/kpis` -> `registrations` |
| FTDs | Sum of first-time depositors in selected date range | `/kpis` -> `ftds` |
| Actives | Sum of active sports users in selected date range | `/kpis` -> `actives` |
| Total Deposits | Sum of deposits in range, else `Pending` if no tx data | `/transactions/kpis` -> `deposits`, `has_data` |
| Total Withdrawals | Sum of withdrawals in range, else `Pending` if no tx data | `/transactions/kpis` -> `withdrawals`, `has_data` |
| Total Turnover | `sportsbook_turnover + casino_turnover` | `/kpis` -> `turnover` |
| GGR | `sportsbook_ggr + casino_ggr` | `/kpis` -> `ggr` |
| NGR | `ggr - bonus_spent` (real value when `/kpis` succeeds) | `/kpis` -> `ngr` |
| V_FTDs | `round(FTDs * 0.12)` | Frontend derived from `kpiFtds` |
| Top_FTDs | `round(FTDs * 0.04)` | Frontend derived from `kpiFtds` |
| Conversion Rate | Last point of daily conversion series (`FTD / Registrations * 100`) | `/timeseries/registrations` derived |

### NGR Quality Badge

- NGR subtitle shows: `Bonus coverage X/Y days`.
- `X = number of days present in /bonus/daily for selected range`.
- `Y = total calendar days between Date From and Date To (inclusive)`.

## Charts and Tables

| Widget | Calculation | Source |
|---|---|---|
| Revenue Trends (toggle: GGR/NGR/Turnover) | Daily combined series then aggregated by granularity: `turnover`, `ggr`, `ngr` where `ngr = ggr - bonus_credited` | `/kpis/daily` + `/casino/daily` + `/bonus/daily` |
| Stake vs Revenue | Uses same basis as Revenue Trends; `stake = turnover`, `revenue = ggr` | Derived from Revenue Trends dataset |
| Player Acquisition (Trend) | Monthly sums of `registrations` and `ftds` | `/timeseries/registrations` |
| Player Acquisition (MoM %) | `(current_month - previous_month) / previous_month * 100` for Registrations and FTDs | Derived from Player Acquisition monthly dataset |
| Conversion Rate (line) | Daily `rate = (ftd / registrations) * 100`; weekly/monthly use average of daily rates | `/timeseries/registrations` + granularity aggregator |
| Segment Distribution - Actives | Current implementation uses mock segment counts and percentages | `mockData.ts` |
| Deposit vs Withdrawal Flow | Current implementation uses mock monthly deposits/withdrawals | `mockData.ts` |
| Segment Performance | Mirrors Segment Distribution counts and percentages | Derived from Segment Distribution (mock) |
| Geographic Distribution | Current implementation uses mock players and GGR | `mockData.ts` |
| Traffic Source Breakdown | Current implementation uses mock source counts and percentages | `mockData.ts` |
| Trend by Segment | Current implementation uses mock segment trend values | `mockData.ts` |
| Daily Trend with 7-day MA | Current implementation uses mock `value` and `ma7` | `mockData.ts` |
| Betslip Status | Current implementation uses mock status distribution | `mockData.ts` |
| Top Sports by Revenue | Current implementation uses mock sport revenue | `mockData.ts` |
| By Platform | Current implementation uses mock percentages | `mockData.ts` |
| User Status | Current implementation uses mock status counts | `mockData.ts` |
| Summary Metrics table | Current implementation uses mock overview/sport/casino metric rows | `mockData.ts` |
| Detailed Breakdown table | Current implementation uses mock rows (date/brand/segment/territory/value/%change) | `mockData.ts` |

## Granularity Rules

- Daily: no aggregation.
- Weekly/Monthly: numeric fields are summed, except fields explicitly marked as average fields (for example conversion `rate`, and MA lines where configured).

## Why Negative Revenue Can Happen

- Negative daily GGR is valid when payouts exceed stake for settled events:
  - `ggr < 0` when `winnings > stake`.
- In current code, this identity holds exactly (sportsbook, casino, and combined):
  - `ggr == stake - winnings`.

