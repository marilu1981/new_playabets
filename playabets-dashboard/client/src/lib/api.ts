/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * ─────────────────────────────────────────────────────────────────────────────
 * API Service Layer — INACTIVE (Mock Mode)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * STATUS: All API calls are currently DISABLED and return mock data.
 * To activate real API calls:
 *   1. Connect to the Playa Bets VPN
 *   2. Set API_ENABLED = true
 *   3. Set API_BASE_URL to the DWH API endpoint (see build.md)
 *   4. Ensure the backend API routes are deployed and accessible
 *
 * ARCHITECTURE:
 *   Frontend → This service layer → (VPN) → Backend API → isbets_bi DWH views
 *
 * DWH VIEWS MAPPED:
 *   Users:        view_Users, view_Balances, view_UserSessions, view_UsersSelfexclusions
 *   Transactions: view_Transactions, view_TransactionTypes
 *   Bonus:        view_BonusCampaigns, view_BonusBalances, view_Freebets
 *   Bets:         view_Betslips, view_Bets, view_EventProgram
 *   Casino:       view_CasinoBets, view_CasinoGames, view_VirtualGames
 *   Hierarchy:    view_Hierarchy, view_UserRoles
 *   Compliance:   view_ImportStatus, view_AuditLog
 *   Lookup:       view_Sports, view_Currencies, view_Countries, view_BetslipStatuses
 */

import * as mock from "./mockData";

// ─── Configuration ────────────────────────────────────────────────────────────
const API_ENABLED = import.meta.env.VITE_API_ENABLED === "true"; // controlled via env (VITE_API_ENABLED)
const DEFAULT_API_BASE_URL = "http://localhost:8080";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
const API_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? "10000", 10) || 10_000;

// ─── Date Range Filter ────────────────────────────────────────────────────────
export interface DateRange {
  from: string; // ISO date string e.g. "2026-01-01"
  to: string;   // ISO date string e.g. "2026-02-22"
}
function toStartEndParams(range?: DateRange): Record<string, string> | undefined {
  if (!range) {
    return undefined;
  }
  const start = range.from?.trim();
  const end = range.to?.trim();
  if (!start || !end) {
    return undefined;
  }
  return { start, end };
}

// ─── Generic Fetch Wrapper ────────────────────────────────────────────────────
async function apiFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  if (!API_ENABLED) {
    throw new Error("API_DISABLED: Running in mock mode. Connect VPN and set API_ENABLED=true.");
  }

  const url = new URL(`${API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        // Add auth header here: "Authorization": `Bearer ${getToken()}`
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`API Error ${res.status}: ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Helper: Return mock or fetch real data ───────────────────────────────────
async function withMock<T>(mockValue: T, endpoint: string, params?: Record<string, string>): Promise<T> {
  if (!API_ENABLED) {
    return mockValue;
  }
  return apiFetch<T>(endpoint, params);
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS API
// DWH: view_Users, view_Balances, view_UserSessions, view_UsersSelfexclusions
// ─────────────────────────────────────────────────────────────────────────────

export interface UserKPIs {
  totalUsers: number;
  activeUsers: number;
  frozenUsers: number;
  disabledUsers: number;
  pendingKYC: number;
}

export interface UserStatusBreakdown {
  status: string;
  statusId: number;
  count: number;
}

export interface UserCurrencyBreakdown {
  currency: string;
  currencyId: number;
  users: number;
}

export interface UserRegistrationTrend {
  month: string;
  registrations: number;
  churned: number;
}

export interface SelfExclusionSummary {
  total: number;
  inProgress: number;
  pending: number;
  completed: number;
  byPeriod: Array<{ period: string; count: number }>;
}

export const usersApi = {
  getKPIs: () => withMock<UserKPIs>(
    {
      totalUsers: mock.overviewKPIs.totalUsers,
      activeUsers: mock.overviewKPIs.activeUsers,
      frozenUsers: mock.usersByStatus.find(u => u.status === "Frozen")?.count ?? 0,
      disabledUsers: mock.usersByStatus.find(u => u.status === "Disabled")?.count ?? 0,
      pendingKYC: mock.complianceKPIs.pendingKYC,
    },
    "/users/kpis"
  ),

  getStatusBreakdown: () => withMock<UserStatusBreakdown[]>(
    mock.usersByStatus,
    "/users/status-breakdown"
  ),

  getCurrencyBreakdown: () => withMock<UserCurrencyBreakdown[]>(
    mock.usersByCurrency,
    "/users/currency-breakdown"
  ),

  getRegistrationTrend: (range?: DateRange) => withMock<UserRegistrationTrend[]>(
    mock.userRegistrations,
    "/users/registration-trend",
    toStartEndParams(range)
  ),

  getSelfExclusions: () => withMock<SelfExclusionSummary>(
    mock.selfExclusionSummary,
    "/users/self-exclusions"
  ),

  getRecentSessions: (limit = 50) => withMock(
    mock.recentSessions,
    "/users/sessions",
    { limit: String(limit) }
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTIONS API
// DWH: view_Transactions, view_TransactionTypes
// ─────────────────────────────────────────────────────────────────────────────

export interface TransactionKPIs {
  totalDeposits: number;
  totalWithdrawals: number;
  pendingTransactions: number;
  acceptedToday: number;
  refusedToday: number;
}

export const transactionsApi = {
  getKPIs: (range?: DateRange) => withMock<TransactionKPIs>(
    mock.transactionSummary,
    "/transactions/kpis",
    toStartEndParams(range)
  ),

  getTrend: (range?: DateRange) => withMock(
    mock.transactionTrend,
    "/transactions/trend",
    toStartEndParams(range)
  ),

  getByReason: (range?: DateRange) => withMock(
    mock.transactionsByReason,
    "/transactions/by-reason",
    toStartEndParams(range)
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// BETTING API
// DWH: view_Betslips, view_Bets, view_EventProgram
// ─────────────────────────────────────────────────────────────────────────────

export interface BettingKPIs {
  totalBetslips: number;
  totalStake: number;
  totalWinnings: number;
  grossRevenue: number;
  margin: number;
}

export const bettingApi = {
  getKPIs: (range?: DateRange) => withMock<BettingKPIs>(
    {
      totalBetslips: mock.overviewKPIs.totalBetslips,
      totalStake: mock.overviewKPIs.totalStake,
      totalWinnings: mock.overviewKPIs.totalWinnings,
      grossRevenue: mock.overviewKPIs.grossRevenue,
      margin: (mock.overviewKPIs.totalStake - mock.overviewKPIs.totalWinnings) / mock.overviewKPIs.totalStake * 100,
    },
    "/betting/kpis",
    toStartEndParams(range)
  ),

  getBetslipsByStatus: (range?: DateRange) => withMock(
    mock.betslipsByStatus,
    "/betting/betslips-by-status",
    toStartEndParams(range)
  ),

  getBetslipsByType: (range?: DateRange) => withMock(
    mock.betslipsByType,
    "/betting/betslips-by-type",
    toStartEndParams(range)
  ),

  getBetsByType: (range?: DateRange) => withMock(
    mock.betsByType,
    "/betting/bets-by-type",
    toStartEndParams(range)
  ),

  getTopSports: (range?: DateRange) => withMock(
    mock.topSports,
    "/betting/top-sports",
    toStartEndParams(range)
  ),

  getByApplication: (range?: DateRange) => withMock(
    mock.betsByApplication,
    "/betting/by-application",
    toStartEndParams(range)
  ),

  getRevenueTrend: (range?: DateRange) => withMock(
    mock.revenueTrend,
    "/betting/revenue-trend",
    toStartEndParams(range)
  ),

  getUpcomingEvents: (limit = 20) => withMock(
    mock.upcomingEvents,
    "/betting/upcoming-events",
    { limit: String(limit) }
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// BONUS API
// DWH: view_BonusCampaigns, view_BonusBalances, view_Freebets
// ─────────────────────────────────────────────────────────────────────────────

export const bonusApi = {
  getKPIs: () => withMock(mock.bonusKPIs, "/bonus/kpis"),
  getCampaigns: (status?: "Active" | "Finished" | "All") => withMock(
    status && status !== "All"
      ? mock.bonusCampaigns.filter(c => c.status === status)
      : mock.bonusCampaigns,
    "/bonus/campaigns",
    status ? { status } : undefined
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// CASINO API
// DWH: view_CasinoBets, view_CasinoGames, view_VirtualGames
// ─────────────────────────────────────────────────────────────────────────────

export const casinoApi = {
  getKPIs: (range?: DateRange) => withMock(
    mock.casinoKPIs,
    "/casino/kpis",
    toStartEndParams(range)
  ),
  getProviders: (range?: DateRange) => withMock(
    mock.casinoProviders,
    "/casino/providers",
    toStartEndParams(range)
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// HIERARCHY API
// DWH: view_Hierarchy, view_UserRoles
// ─────────────────────────────────────────────────────────────────────────────

export const hierarchyApi = {
  getSummary: () => withMock(mock.hierarchySummary, "/hierarchy/summary"),
  getAgents: (limit = 50) => withMock(
    mock.topAgents,
    "/hierarchy/agents",
    { limit: String(limit) }
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE API
// DWH: view_ImportStatus, view_AuditLog, view_UsersSelfexclusions
// ─────────────────────────────────────────────────────────────────────────────

export const complianceApi = {
  getKPIs: () => withMock(mock.complianceKPIs, "/compliance/kpis"),
  getImportStatus: () => withMock(mock.importStatus, "/compliance/import-status"),
  getSelfExclusions: () => withMock(mock.selfExclusionSummary, "/compliance/self-exclusions"),
};

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW API
// Aggregated KPIs for the main dashboard
// ─────────────────────────────────────────────────────────────────────────────

export const overviewApi = {
  getKPIs: () => withMock(mock.overviewKPIs, "/overview/kpis"),
  getRevenueTrend: (range?: DateRange) => withMock(
    mock.revenueTrend,
    "/overview/revenue-trend",
    toStartEndParams(range)
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP API
// DWH: view_Sports, view_Currencies, view_Countries, view_BetslipStatuses
// ─────────────────────────────────────────────────────────────────────────────

export const lookupApi = {
  getSports: () => withMock(
    mock.topSports.map(s => ({ sportId: s.sportId, name: s.sport })),
    "/lookup/sports"
  ),
  getCurrencies: () => withMock(
    mock.usersByCurrency.map(c => ({ currencyId: c.currencyId, name: c.currency })),
    "/lookup/currencies"
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// API STATUS CHECK
// ─────────────────────────────────────────────────────────────────────────────

export function getApiStatus(): { enabled: boolean; baseUrl: string; mode: "live" | "mock" } {
  return {
    enabled: API_ENABLED,
    baseUrl: API_BASE_URL,
    mode: API_ENABLED ? "live" : "mock",
  };
}
