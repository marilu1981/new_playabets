# Playa Bets Analytics Dashboard — Build Tracker

> **Status:** Frontend complete (mock data). API layer built but inactive. VPN connection required to activate live data.
> **Last Updated:** 2026-02-22

---

## Project Overview

This is the internal analytics dashboard for **Playa Bets**, an African sports betting company operating in Nigeria (NGN), Ghana (GHS), Uganda (UGX), Kenya (KES), and Zambia (ZMW). The dashboard is built on top of the `isbets_bi` Data Warehouse (DWH), which exposes data through a series of SQL views.

---

## Local Development Setup

> **Important:** The dashboard is a fully self-contained project at `playabets-dashboard/` in the repo root. Run all commands from that directory — **not** from `frontend/` or `frontend/dashboard-client/`.

### Prerequisites

```bash
# Install pnpm globally if not already installed (required — do not use npm or yarn)
npm install -g pnpm
```

### Running the Dashboard

```bash
# 1. Navigate to the correct directory
cd playabets-dashboard

# 2. Install dependencies
pnpm install

# 3. Start the dev server
pnpm dev
# → Opens at http://localhost:3000
```

### Other Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Production build to `dist/` |
| `pnpm check` | TypeScript type check (zero errors expected) |
| `pnpm preview` | Preview the production build locally |

### What NOT to run for the dashboard

| Command | Why to avoid |
|---|---|
| `uvicorn app:app` | This is for the **Python backend** in `src/` or `backend/` — a separate project unrelated to the dashboard |
| `npm run dev` from `frontend/` | This runs the **old Vite project**, not the dashboard |
| `pnpm dev` from `frontend/dashboard-client/` | Missing `package.json` — always run from `playabets-dashboard/` |
| `npm install` | Use `pnpm install` instead — the lockfile is pnpm format |

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend Framework | React 19 + TypeScript | Vite build tool |
| Styling | Tailwind CSS v4 + shadcn/ui | Savanna Gold design system |
| Charts | Recharts | Area, Bar, Pie charts |
| Routing | Wouter | Client-side SPA routing |
| Fonts | Playfair Display + DM Sans + Space Mono | Google Fonts CDN |
| State | React hooks (useState, useEffect) | No external state manager needed yet |
| API Layer | Custom fetch wrapper in `client/src/lib/api.ts` | Currently inactive (mock mode) |
| Data Source | isbets_bi DWH (PostgreSQL/SQL Server) | Requires VPN access |

---

## File Structure

```
playabets-dashboard/
├── build.md                          ← This file
├── ideas.md                          ← Design brainstorm (Savanna Gold selected)
├── client/
│   ├── index.html                    ← Google Fonts loaded here
│   └── src/
│       ├── App.tsx                   ← Routes for all 9 pages
│       ├── index.css                 ← Savanna Gold design tokens (OKLCH)
│       ├── lib/
│       │   ├── api.ts                ← ⚠️ API stubs (INACTIVE — see below)
│       │   ├── mockData.ts           ← All mock data mirroring DWH view structures
│       │   └── formatters.ts        ← Number/currency/date formatters
│       ├── components/
│       │   ├── DashboardLayout.tsx   ← Sidebar + top bar layout
│       │   ├── KpiCard.tsx           ← Reusable KPI metric card
│       │   ├── StatusBadge.tsx       ← Status pill badges
│       │   └── DataTable.tsx         ← Reusable data table
│       └── pages/
│           ├── Home.tsx              ← Executive Overview dashboard
│           ├── Users.tsx             ← Users & Players
│           ├── Betting.tsx           ← Betting & Events
│           ├── Transactions.tsx      ← Transactions
│           ├── Bonus.tsx             ← Bonus & Campaigns
│           ├── Casino.tsx            ← Casino & Games
│           ├── Commissions.tsx       ← Commissions
│           ├── Compliance.tsx        ← Compliance & Audit
│           └── Hierarchy.tsx         ← Hierarchy & Roles
```

---

## Dashboard Pages

| Route | Page | DWH Views Used |
|---|---|---|
| `/` | Executive Overview | All views (aggregated) |
| `/users` | Users & Players | `view_Users`, `view_Balances`, `view_UserSessions`, `view_UsersSelfexclusions` |
| `/betting` | Betting & Events | `view_Betslips`, `view_Bets`, `view_EventProgram` |
| `/transactions` | Transactions | `view_Transactions`, `view_TransactionTypes` |
| `/bonus` | Bonus & Campaigns | `view_BonusCampaigns`, `view_BonusBalances`, `view_Freebets` |
| `/casino` | Casino & Games | `view_CasinoBets`, `view_CasinoGames`, `view_VirtualGames` |
| `/commissions` | Commissions | `view_CommissionsSport`, `view_CommissionsCasino`, `view_CommissionsPoker` |
| `/compliance` | Compliance & Audit | `view_ImportStatus`, `view_AuditLog`, `view_UsersSelfexclusions` |
| `/hierarchy` | Hierarchy & Roles | `view_Hierarchy`, `view_UserRoles` |

---

## API Layer — What You Need to Edit Locally

### File: `client/src/lib/api.ts`

This file contains all API stubs. Currently **all calls return mock data**. To activate live data:

#### Step 1 — Connect to VPN
Ensure you are connected to the Playa Bets VPN before making any changes.

#### Step 2 — Set the API base URL
```typescript
// Line ~20 in api.ts
const API_BASE_URL = "http://localhost:8080/api"; // ← REPLACE with real DWH API URL
```

The real URL should point to the backend service that queries the `isbets_bi` DWH views. Examples:
- Local tunnel: `http://localhost:8080/api`
- Direct server: `http://10.x.x.x:8080/api`
- Domain: `https://api.internal.playabets.com/api`

#### Step 3 — Enable the API
```typescript
// Line ~19 in api.ts
const API_ENABLED = false; // ← CHANGE TO true
```

#### Step 4 — Add Authentication
If the DWH API requires authentication, add the auth header in the `apiFetch` function:
```typescript
headers: {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${getToken()}`, // ← Uncomment and implement getToken()
},
```

---

## Backend API Endpoints Required

The frontend expects the following REST API endpoints. You will need to build or configure these to query the DWH views:

### Overview
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/overview/kpis` | Aggregated KPIs from multiple views |
| GET | `/api/overview/revenue-trend?from=&to=` | Daily stake/winnings/revenue from `view_Betslips` |

### Users
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/users/kpis` | COUNT from `view_Users` grouped by status |
| GET | `/api/users/status-breakdown` | `SELECT StatusId, COUNT(*) FROM view_Users GROUP BY StatusId` |
| GET | `/api/users/currency-breakdown` | `SELECT CurrencyId, COUNT(*) FROM view_Users GROUP BY CurrencyId` |
| GET | `/api/users/registration-trend?from=&to=` | Monthly registrations from `view_Users` |
| GET | `/api/users/self-exclusions` | From `view_UsersSelfexclusions` |
| GET | `/api/users/sessions?limit=` | From `view_UserSessions` ORDER BY LoginDate DESC |

### Transactions
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/transactions/kpis?from=&to=` | SUM from `view_Transactions` |
| GET | `/api/transactions/trend?from=&to=` | Daily deposits/withdrawals from `view_Transactions` |
| GET | `/api/transactions/by-reason?from=&to=` | GROUP BY TransactionReasonId |

### Betting
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/betting/kpis?from=&to=` | SUM from `view_Betslips` |
| GET | `/api/betting/betslips-by-status?from=&to=` | GROUP BY BetslipStatusId |
| GET | `/api/betting/betslips-by-type?from=&to=` | GROUP BY BetslipTypeId |
| GET | `/api/betting/bets-by-type?from=&to=` | GROUP BY BetTypeId from `view_Bets` |
| GET | `/api/betting/top-sports?from=&to=` | GROUP BY SportId, JOIN `view_Sports` |
| GET | `/api/betting/by-application?from=&to=` | GROUP BY ApplicationTypeId |
| GET | `/api/betting/revenue-trend?from=&to=` | Daily from `view_Betslips` |
| GET | `/api/betting/upcoming-events?limit=` | From `view_EventProgram` WHERE StartDate >= NOW() |

### Bonus
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/bonus/kpis` | Aggregated from `view_BonusCampaigns`, `view_Freebets` |
| GET | `/api/bonus/campaigns?status=` | From `view_BonusCampaigns` |

### Casino
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/casino/kpis?from=&to=` | SUM from `view_CasinoBets` |
| GET | `/api/casino/providers?from=&to=` | GROUP BY ProviderId from `view_CasinoBets` |

### Commissions
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/commissions/summary?from=&to=` | SUM from `view_CommissionsSport`, `view_CommissionsCasino`, `view_CommissionsPoker` |
| GET | `/api/commissions/top-agents?limit=` | GROUP BY AgentId, ORDER BY SUM(Commission) DESC |

### Hierarchy
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/hierarchy/summary` | COUNT by role level from `view_Hierarchy` |
| GET | `/api/hierarchy/agents?limit=` | From `view_Hierarchy` WHERE RoleId IN (agent roles) |

### Compliance
| Method | Endpoint | DWH Query |
|---|---|---|
| GET | `/api/compliance/kpis` | Aggregated compliance metrics |
| GET | `/api/compliance/import-status` | From `view_ImportStatus` |
| GET | `/api/compliance/self-exclusions` | From `view_UsersSelfexclusions` |

---

## Design System

### Savanna Gold Theme
The dashboard uses a custom dark theme inspired by the African savanna landscape:

| Token | Value | Usage |
|---|---|---|
| Background | `oklch(0.14 0.04 155)` | Deep forest green — main bg |
| Card | `oklch(0.19 0.04 155)` | Slightly lighter — card surfaces |
| Primary / Gold | `oklch(0.72 0.14 85)` | Warm gold — KPI accents, active nav |
| Positive | `oklch(0.62 0.17 145)` | Green — positive metrics |
| Negative | `oklch(0.55 0.22 25)` | Red — negative metrics |
| Warning | `oklch(0.72 0.17 60)` | Amber — warnings |
| Teal | `oklch(0.65 0.15 195)` | Teal — info/frozen states |

### Typography
- **Headers:** Playfair Display (serif, 600–800 weight) — editorial authority
- **Body / Navigation:** DM Sans (sans-serif, 300–600 weight) — clean and modern
- **Data Values:** Space Mono (monospace, 400/700) — technical precision for numbers

---

## Known Limitations & Next Steps

### Immediate (before going live)
1. **VPN Connection** — All API calls require VPN access to the DWH server
2. **API Base URL** — Update `API_BASE_URL` in `client/src/lib/api.ts`
3. **Authentication** — Implement token-based auth in the API fetch wrapper
4. **Date Range Filters** — The UI date picker component needs to be wired to API calls (currently uses all-time mock data)

### Short-term improvements
5. **Pagination** — Tables currently show all mock data; add server-side pagination for large datasets
6. **Currency Selector** — Add a global currency toggle (NGN / GHS / UGX / KES / ZMW) that filters all views
7. **Export Functionality** — Add CSV/Excel export buttons to all data tables
8. **Real-time Updates** — Consider WebSocket or polling for live bet counts and session data
9. **Error Boundaries** — Add per-page error states for when API calls fail

### Long-term
10. **User Authentication** — Add login page with role-based access (Operator / Master Agent / Sub-Agent)
11. **Drill-down Pages** — Individual user profiles, betslip detail views, campaign detail pages
12. **Alerts System** — Configurable alerts for AML flags, import failures, unusual betting patterns
13. **Mobile Optimization** — The sidebar collapses on mobile but tables need responsive redesign

---

## Recommended Approach: Backend API

**Recommendation:** Build a lightweight Node.js/Express or Python/FastAPI backend that:
1. Connects to the DWH via the existing SQL Server/PostgreSQL connection
2. Exposes the REST endpoints listed above
3. Implements caching (Redis or in-memory) for expensive aggregation queries
4. Handles authentication via JWT tokens

This backend should run inside the VPN perimeter. The frontend can then be deployed publicly (or internally) and communicate with the backend API over the VPN tunnel.

**Alternative:** If a direct database connection is preferred, consider using a tool like **Metabase** or **Apache Superset** for the reporting layer, and use this React dashboard as the custom UI shell that embeds those reports.

---

## DWH Connection Details (to be filled in locally)

```
# Edit these values on your local machine after connecting to VPN
DWH_HOST=<fill in>
DWH_PORT=<fill in>
DWH_DATABASE=isbets_bi
DWH_SCHEMA=dbo
DWH_USERNAME=<fill in>
DWH_PASSWORD=<fill in>
```

The DWH views are in the `isbets_bi` database, `dbo` schema. All view names follow the pattern `view_<Domain>`.

---

## Changelog

| Date | Change |
|---|---|
| 2026-02-22 | Initial build — all 9 pages, mock data, inactive API stubs |
