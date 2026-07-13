# Playa Bets Analytics API — Client Reference

**Version:** 0.3 · **Last updated:** 2026-07-13

REST API serving Playa Bets analytics data (KPIs, revenue, casino, sportsbook, bonus, transactions, acquisition, VIP and player segments). All endpoints are **read-only** and return **JSON**. Data is pre-computed from the data warehouse and refreshed on a schedule (see *Data freshness* below).

---

## 1. Base URL

```
https://playabets-api.mangosand-06391868.southafricanorth.azurecontainerapps.io
```

## 2. Authentication

Every request must include the API key (provided to you separately) in one of these headers:

```
X-API-Key: <API_KEY>
```
or
```
Authorization: Bearer <API_KEY>
```

Requests without a valid key receive `401 {"detail": "Invalid or missing API key"}`.

### Quick start

```bash
curl -H "X-API-Key: <API_KEY>" \
  "https://playabets-api.mangosand-06391868.southafricanorth.azurecontainerapps.io/kpis/latest"
```

## 3. Interactive documentation

Two auto-generated resources are available without authentication:

| URL | What it is |
|---|---|
| `/docs` | Swagger UI — browse and try every endpoint in the browser |
| `/openapi.json` | OpenAPI 3 spec — import into Postman / Insomnia / code generators |

*(Executing requests from Swagger UI still requires the API key — click **Authorize** / add the `X-API-Key` header.)*

## 4. Conventions

- **Dates** are `YYYY-MM-DD` strings. `start` and `end` are **inclusive**.
- **Money** values are ZAR.
- Where an endpoint accepts filters, the common ones are:
  `territory`, `country`, `customer_status`, `current_segment` (all optional strings).
- Endpoints with optional `start`/`end` default to a sensible recent window (usually the last 30 days or current month).
- Validation errors return `422` with a `detail` array describing the offending parameter.

### Key metric glossary

| Term | Meaning |
|---|---|
| GGR | Gross Gaming Revenue = stake − winnings (cash, excludes bonus play) |
| NGR | Net Gaming Revenue = GGR − bonus costs − taxes |
| FTD | First-Time Depositor |
| Hold % | GGR ÷ turnover |
| Turnover | Total stakes placed |
| RFM | Recency/Frequency/Monetary player segmentation (VIP, Active, New, Cooling, Lapsed, Dormant) |

---

## 5. Endpoints

### 5.1 Core KPIs

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /kpis` | `start`*, `end`*, filters | Aggregated KPIs for the period (registrations, actives, stakes, GGR, hold %, win rate, RFM counts) |
| `GET /kpis/latest` | — | Most recent day's full KPI row, incl. `last_updated` timestamp |
| `GET /kpis/summary` | `start`*, `end`*, `previous_start`, `previous_end`, `ytd_start` | Dashboard-style summary with period-on-period comparison and YTD |
| `GET /kpis/daily` | `start`, `end`, `metrics` (comma-separated), filters | One row per day; `metrics` limits the columns returned |
| `GET /kpis/series` | `metric`*, `days` (default 30) | Single-metric daily series for the last *n* days |
| `GET /kpis/rolling` | `start`, `end`, `limit` (default 180) | Rolling-window KPI series |

Example — `GET /kpis/latest`:

```json
{
  "date": "2026-07-13",
  "registrations": 264,
  "actives_sports": 80,
  "betslips_count": 141,
  "placed_stake": 13383.04,
  "ggr": 3666.94,
  "hold_pct": 0.3706,
  "rfm_vip": 6339,
  "rfm_active": 65562,
  "last_updated": "2026-07-13 10:25 SAST"
}
```

### 5.2 Time series

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /timeseries/revenue` | `start`*, `end`*, `metric` (default `ggr`) | Daily `{date, value}` points for the chosen revenue metric |
| `GET /timeseries/registrations` | `start`*, `end`*, filters | Daily registration counts |
| `GET /timeseries/conversion-cohorts` | `start`*, `end`* | Registration → FTD conversion by cohort |

Example — `GET /timeseries/revenue?start=2026-07-01&end=2026-07-03&metric=ggr`:

```json
{
  "metric": "ggr",
  "points": [
    {"date": "2026-07-01", "value": -49167.02},
    {"date": "2026-07-02", "value": -5075.24},
    {"date": "2026-07-03", "value": 33312.68}
  ]
}
```

### 5.3 Acquisition & retention

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /ftd/daily` | `start`*, `end`* | Daily first-time depositors |
| `GET /ftd-reg-month/daily` | `start`*, `end`* | Daily FTDs attributed to their registration month |
| `GET /crm/retention` | `start`, `end` | 7/30/90-day player retention by cohort month |
| `GET /acquisition/kpis` | `start`, `end` | Period-total acquisition KPIs across all channels |
| `GET /acquisition/channels` | `start`, `end` | Per-channel breakdown (RavenTrack affiliate classification) |
| `GET /acquisition/affiliates` | `start`, `end`, `limit` (100), `sort_by` (`revenue`) | Per-affiliate leaderboard |

### 5.4 Sportsbook

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /sportsbook/kpis` | `start`*, `end`*, filters | Sportsbook stakes, winnings, GGR, hold %, actives |
| `GET /betting/betslips-by-status` | `start`*, `end`*, filters | Betslip counts/stakes split by status (won, lost, open, cancelled…) |
| `GET /betting/betslips-by-type` | `start`*, `end`*, filters | Betslip counts/stakes split by type (single, multiple…) |

### 5.5 Casino

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /casino/kpis` | `start`*, `end`* | Casino stakes, winnings, GGR, actives for the period |
| `GET /casino/daily` | `start`*, `end`* | One row per day |
| `GET /casino/providers` | `start`, `end` | Per-provider breakdown (Pragmatic, Evolution, Hacksaw…) |
| `GET /casino/types` | `start`, `end` | Split by casino type (Casino / Live Casino…) |

### 5.6 Transactions (payments)

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /transactions/kpis` | `start`*, `end`* | Deposits, withdrawals, net cash for the period |
| `GET /transactions/trend` | `start`*, `end`* | Daily deposit/withdrawal series |
| `GET /transactions/providers` | `start`*, `end`* | Per-payment-provider and reason breakdown plus totals |

### 5.7 Bonus

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /bonus/kpis` | `start`, `end` | Bonus issued/converted/expired totals |
| `GET /bonus/daily` | `start`*, `end`* | Daily bonus series |
| `GET /bonus/campaigns` | `status` (optional) | Campaign list with performance |
| `GET /bonus/freebets` | `start`, `end` | Free-bet issuance and usage |

### 5.8 Product

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /product/daily` | `start`*, `end`* | Daily GGR, turnover, hold % per product vertical (sports vs casino) |

### 5.9 VIP

All VIP endpoints accept optional `start`, `end`, `account_manager`, `stage` filters.

| Endpoint | Extra parameters | Returns |
|---|---|---|
| `GET /vip/summary` | — | Headline VIP counts and revenue |
| `GET /vip/list` | `current_only` (false), `limit` (250) | VIP roster rows |
| `GET /vip/revenue` | — | Period-active VIP revenue totals |
| `GET /vip/by-manager` | — | Per-account-manager rollup |
| `GET /vip/top-players` | `limit` (20) | Top VIPs ranked by turnover |
| `GET /vip/product-share` | — | Sports vs casino split across current VIPs |
| `GET /vip/demographics` | — | Age-band and country distribution |
| `GET /vip/trends` | — | 31-day daily NGR/GGR/turnover/margin trend |
| `GET /vip/monthly` | — | 6-month performance, one row per month |
| `GET /vip/hourly` | — | Hourly betting-activity pattern |
| `GET /vip/overview` | `include_demographics` (false) | All VIP sections in a single response |

### 5.10 Players & segments

| Endpoint | Parameters | Returns |
|---|---|---|
| `GET /rfm/segments` | `start`, `end`, `mode` | Player counts and value per RFM segment |
| `GET /rfm/users` | `segment`, `limit` (200), `columns` | Individual player rows for a segment |
| `GET /rfm/risk` | — | Summary of churn-risk tiers across all players |
| `GET /rfm/risk/players` | `tier` (Critical/High/Moderate/Low), `segment`, `limit` (200) | Individual players ordered by risk score |
| `GET /users/status-breakdown` | filters | Player counts by account status |
| `GET /users/self-exclusions` | — | Current self-exclusion snapshot |
| `GET /users/self-exclusions/trend` | `start`, `end` | Monthly self-exclusion trend (started/active/completed) |

### 5.11 Service

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /health` | none | Service status and dataset availability flags |

`*` = required parameter.

> Endpoints not listed here (`/admin/*`, `/vip/upload`, `/cache/clear`, `/insights/*`) are internal to the Playa Bets dashboard and not part of the client contract.

---

## 6. Data freshness

Data is extracted from the warehouse and pre-aggregated by a scheduler; it is **not** live-queried per request. `GET /kpis/latest` includes a `last_updated` timestamp (SAST), and `GET /health` reports which datasets are loaded. Intraday figures for the current day are partial until the next refresh.

## 7. Errors

| Status | Meaning |
|---|---|
| `401` | Missing or invalid API key |
| `422` | Invalid/missing parameter — body's `detail` array explains which |
| `500` | Server error — retry; contact support if persistent |

## 8. Support

For access issues, key rotation, or new endpoint requests, contact the Playa Bets analytics team.
