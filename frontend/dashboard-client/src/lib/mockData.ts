/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * Mock Data Layer — mirrors DWH view structures
 * All data is fictional and for UI development only.
 * Replace with real API calls when VPN is available.
 */

// ─── KPI Overview ────────────────────────────────────────────────────────────
export const overviewKPIs = {
  totalUsers: 142_830,
  activeUsers: 38_412,
  totalBetslips: 2_847_391,
  totalStake: 9_482_100,
  totalWinnings: 8_103_200,
  grossRevenue: 1_378_900,
  activeCampaigns: 14,
  selfExclusions: 287,
  currency: "NGN",
};

// ─── Revenue Trend (last 30 days) ────────────────────────────────────────────
export const revenueTrend = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(2026, 1, i + 1);
  const base = 40_000 + Math.sin(i / 3) * 8_000;
  const stake = Math.round(base + Math.random() * 15_000);
  const winnings = Math.round(stake * (0.82 + Math.random() * 0.1));
  return {
    date: date.toISOString().split("T")[0],
    stake,
    winnings,
    revenue: stake - winnings,
  };
});

// ─── Betslips by Status ───────────────────────────────────────────────────────
export const betslipsByStatus = [
  { status: "Paid - Closed", count: 1_842_100, statusId: 50 },
  { status: "In Progress", count: 412_300, statusId: 10 },
  { status: "To Be Paid", count: 98_400, statusId: 40 },
  { status: "Under Evaluation", count: 34_200, statusId: 5 },
  { status: "Cancelled", count: 460_391, statusId: 6 },
];

// ─── Betslips by Type ─────────────────────────────────────────────────────────
export const betslipsByType = [
  { type: "Normal", count: 1_920_000, typeId: 1 },
  { type: "Live", count: 680_000, typeId: 2 },
  { type: "Mixed", count: 247_391, typeId: 3 },
];

// ─── Bet Types (Single, Multiple, etc.) ──────────────────────────────────────
export const betsByType = [
  { betType: "Single", count: 1_540_000, stake: 4_200_000 },
  { betType: "Multiple", count: 820_000, stake: 3_100_000 },
  { betType: "Combined", count: 380_000, stake: 1_800_000 },
  { betType: "Split", count: 107_391, stake: 382_100 },
];

// ─── Application Type Breakdown ──────────────────────────────────────────────
export const betsByApplication = [
  { app: "Mobile", count: 1_820_000, percentage: 63.9 },
  { app: "Web Site", count: 780_000, percentage: 27.4 },
  { app: "API", count: 180_000, percentage: 6.3 },
  { app: "Cashier", count: 67_391, percentage: 2.4 },
];

// ─── Top Sports ───────────────────────────────────────────────────────────────
export const topSports = [
  { sport: "Soccer", sportId: 1, bets: 1_420_000, stake: 5_200_000, revenue: 480_000 },
  { sport: "Basketball", sportId: 2, bets: 380_000, stake: 1_400_000, revenue: 130_000 },
  { sport: "Tennis", sportId: 4, bets: 290_000, stake: 980_000, revenue: 95_000 },
  { sport: "Horse Racing", sportId: 43, bets: 180_000, stake: 720_000, revenue: 110_000 },
  { sport: "Rugby", sportId: 14, bets: 120_000, stake: 480_000, revenue: 62_000 },
  { sport: "Cricket", sportId: 9, bets: 98_000, stake: 320_000, revenue: 38_000 },
  { sport: "American Football", sportId: 21, bets: 74_000, stake: 240_000, revenue: 28_000 },
  { sport: "Boxing", sportId: 17, bets: 62_000, stake: 180_000, revenue: 22_000 },
];

// ─── Users by Status ──────────────────────────────────────────────────────────
export const usersByStatus = [
  { status: "Enabled", count: 98_420, statusId: 1 },
  { status: "Disabled", count: 28_310, statusId: 2 },
  { status: "Frozen", count: 8_740, statusId: 5 },
  { status: "Be Validated", count: 4_820, statusId: 4 },
  { status: "Deleted", count: 2_540, statusId: 3 },
];

// ─── User Registrations (last 12 months) ─────────────────────────────────────
export const userRegistrations = [
  { month: "Mar 2025", registrations: 3_420, churned: 820 },
  { month: "Apr 2025", registrations: 3_810, churned: 740 },
  { month: "May 2025", registrations: 4_120, churned: 890 },
  { month: "Jun 2025", registrations: 3_980, churned: 960 },
  { month: "Jul 2025", registrations: 4_540, churned: 1_020 },
  { month: "Aug 2025", registrations: 5_210, churned: 1_140 },
  { month: "Sep 2025", registrations: 4_890, churned: 980 },
  { month: "Oct 2025", registrations: 5_640, churned: 1_080 },
  { month: "Nov 2025", registrations: 6_120, churned: 1_200 },
  { month: "Dec 2025", registrations: 7_840, churned: 1_380 },
  { month: "Jan 2026", registrations: 6_920, churned: 1_260 },
  { month: "Feb 2026", registrations: 5_480, churned: 980 },
];

// ─── Users by Currency ────────────────────────────────────────────────────────
export const usersByCurrency = [
  { currency: "Naira (NGN)", currencyId: 11, users: 89_420 },
  { currency: "Ghanian Cedi (GHS)", currencyId: 13, users: 24_810 },
  { currency: "Ugandan Shilling (UGX)", currencyId: 27, users: 14_320 },
  { currency: "Kenyan Shilling (KES)", currencyId: 31, users: 9_840 },
  { currency: "Zambian Kwacha (ZMW)", currencyId: 18, users: 4_440 },
];

// ─── Recent User Sessions ─────────────────────────────────────────────────────
export const recentSessions = [
  { sessionId: 10042891, userId: 284710, username: "player_ng_4821", loginDate: "2026-02-22 08:14:22", ip: "41.184.x.x", app: "Mobile", state: "Active" },
  { sessionId: 10042890, userId: 198432, username: "agent_gh_0921", loginDate: "2026-02-22 08:12:10", ip: "154.120.x.x", app: "Web Site", state: "Active" },
  { sessionId: 10042889, userId: 371204, username: "player_ke_7734", loginDate: "2026-02-22 08:09:44", ip: "197.248.x.x", app: "Mobile", state: "Active" },
  { sessionId: 10042888, userId: 92841, username: "player_ng_2210", loginDate: "2026-02-22 08:05:31", ip: "41.58.x.x", app: "API", state: "Ended" },
  { sessionId: 10042887, userId: 441820, username: "player_ug_5512", loginDate: "2026-02-22 08:01:18", ip: "41.210.x.x", app: "Mobile", state: "Ended" },
];

// ─── Self-Exclusions ──────────────────────────────────────────────────────────
export const selfExclusionSummary = {
  total: 287,
  inProgress: 198,
  pending: 42,
  completed: 47,
  byPeriod: [
    { period: "15 days", count: 28 },
    { period: "30 days", count: 64 },
    { period: "60 days", count: 52 },
    { period: "90 days", count: 48 },
    { period: "180 days", count: 41 },
    { period: "365 days", count: 38 },
    { period: "2+ years", count: 16 },
  ],
};

// ─── Transactions ─────────────────────────────────────────────────────────────
export const transactionSummary = {
  totalDeposits: 12_840_200,
  totalWithdrawals: 9_420_100,
  pendingTransactions: 342,
  acceptedToday: 8_420,
  refusedToday: 128,
};

export const transactionsByReason = [
  { reason: "Deposit", amount: 12_840_200, count: 284_100, type: "Positive" },
  { reason: "Withdrawal", amount: 9_420_100, count: 198_400, type: "Negative" },
  { reason: "Bet Placement", amount: 9_482_100, count: 2_847_391, type: "Negative" },
  { reason: "Bet Winnings", amount: 8_103_200, count: 1_842_100, type: "Positive" },
  { reason: "Bonus Credit", amount: 1_240_800, count: 48_200, type: "Positive" },
];

export const transactionTrend = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(2026, 1, i + 1);
  const deposits = Math.round(380_000 + Math.random() * 120_000);
  const withdrawals = Math.round(deposits * (0.68 + Math.random() * 0.12));
  return {
    date: date.toISOString().split("T")[0],
    deposits,
    withdrawals,
    net: deposits - withdrawals,
  };
});

// ─── Bonus & Campaigns ────────────────────────────────────────────────────────
export const bonusCampaigns = [
  { campaignId: 1042, name: "Welcome Bonus Q1 2026", status: "Active", bonusType: "Deposit Match", startDate: "2026-01-01", endDate: "2026-03-31", usersEnrolled: 8_420, totalPaid: 842_000, roi: -12.4 },
  { campaignId: 1038, name: "Super Sunday Soccer", status: "Active", bonusType: "Freebet", startDate: "2026-01-15", endDate: "2026-02-28", usersEnrolled: 3_210, totalPaid: 321_000, roi: 8.2 },
  { campaignId: 1035, name: "AFCON Special", status: "Finished", bonusType: "Odds Boost", startDate: "2025-12-01", endDate: "2026-01-31", usersEnrolled: 12_840, totalPaid: 1_284_000, roi: -5.8 },
  { campaignId: 1031, name: "VIP Loyalty Dec 2025", status: "Finished", bonusType: "Cashback", startDate: "2025-12-01", endDate: "2025-12-31", usersEnrolled: 1_820, totalPaid: 182_000, roi: 14.2 },
  { campaignId: 1028, name: "New Year Freebet", status: "Finished", bonusType: "Freebet", startDate: "2025-12-28", endDate: "2026-01-07", usersEnrolled: 5_640, totalPaid: 564_000, roi: -3.1 },
];

export const bonusKPIs = {
  activeCampaigns: 14,
  totalBonusBalance: 2_840_200,
  freebetsIssued: 48_200,
  freebetsUsed: 31_480,
  freebetsExpired: 8_420,
  avgBonusPerUser: 67.4,
};

// ─── Casino / Games ───────────────────────────────────────────────────────────
export const casinoProviders = [
  { provider: "Evolution Gaming", casinoType: "Casino", bets: 284_100, stake: 2_840_100, winnings: 2_412_085, profit: 428_015 },
  { provider: "Pragmatic Play", casinoType: "Casino", bets: 198_400, stake: 1_984_000, winnings: 1_706_240, profit: 277_760 },
  { provider: "NetEnt", casinoType: "Casino", bets: 142_800, stake: 1_428_000, winnings: 1_242_360, profit: 185_640 },
  { provider: "Playtech", casinoType: "Virtual Games", bets: 98_200, stake: 982_000, winnings: 844_520, profit: 137_480 },
  { provider: "Microgaming", casinoType: "Casino", bets: 84_100, stake: 841_000, winnings: 731_670, profit: 109_330 },
  { provider: "Red Tiger", casinoType: "Virtual Games", bets: 62_400, stake: 624_000, winnings: 543_888, profit: 80_112 },
];

export const casinoKPIs = {
  totalStake: 8_699_100,
  totalWinnings: 7_480_763,
  grossProfit: 1_218_337,
  margin: 14.0,
  totalBets: 870_000,
};

// ─── Commissions ──────────────────────────────────────────────────────────────
export const commissionSummary = {
  sportDirect: 284_100,
  sportNetwork: 142_050,
  casinoDirect: 98_400,
  casinoNetwork: 49_200,
  pokerDirect: 12_840,
  pokerNetwork: 6_420,
  totalPaid: 593_010,
};

export const topAgentCommissions = [
  { agentId: 10042, username: "agent_ng_master", directUsers: 842, stake: 4_200_000, commissions: 42_000 },
  { agentId: 10038, username: "agent_gh_west", directUsers: 621, stake: 3_105_000, commissions: 31_050 },
  { agentId: 10031, username: "agent_ke_nairobi", directUsers: 498, stake: 2_490_000, commissions: 24_900 },
  { agentId: 10028, username: "agent_ug_kampala", directUsers: 384, stake: 1_920_000, commissions: 19_200 },
  { agentId: 10024, username: "agent_ng_lagos2", directUsers: 312, stake: 1_560_000, commissions: 15_600 },
];

// ─── Compliance / Audit ───────────────────────────────────────────────────────
export const complianceKPIs = {
  selfExclusionsActive: 198,
  frozenAccounts: 8_740,
  pendingKYC: 4_820,
  flaggedTransactions: 128,
  amlAlerts: 34,
};

export const importStatus = [
  { package: "Users Import", status: "Success", lastRun: "2026-02-22 08:00:00", duration: "2m 14s", executions24h: 24, successes24h: 24 },
  { package: "Betslips Import", status: "Success", lastRun: "2026-02-22 08:05:00", duration: "8m 42s", executions24h: 24, successes24h: 23 },
  { package: "Transactions Import", status: "Success", lastRun: "2026-02-22 08:10:00", duration: "4m 18s", executions24h: 24, successes24h: 24 },
  { package: "Casino Import", status: "Warning", lastRun: "2026-02-22 07:55:00", duration: "12m 08s", executions24h: 24, successes24h: 22 },
  { package: "Bonus Import", status: "Success", lastRun: "2026-02-22 08:02:00", duration: "1m 52s", executions24h: 24, successes24h: 24 },
];

// ─── Hierarchy ────────────────────────────────────────────────────────────────
export const hierarchySummary = {
  totalAgents: 2_840,
  masterAgents: 142,
  subAgents: 2_698,
  totalUsers: 142_830,
  avgUsersPerAgent: 50.3,
};

// ─── Event Program ────────────────────────────────────────────────────────────
export const upcomingEvents = [
  { eventId: 48291, sport: "Soccer", event: "Arsenal vs Chelsea", startDate: "2026-02-22 15:00:00", status: "Enabled", openBets: 8_420 },
  { eventId: 48290, sport: "Soccer", event: "Real Madrid vs Barcelona", startDate: "2026-02-22 17:00:00", status: "Enabled", openBets: 12_840 },
  { eventId: 48289, sport: "Basketball", event: "Lakers vs Warriors", startDate: "2026-02-22 20:30:00", status: "Enabled", openBets: 4_210 },
  { eventId: 48288, sport: "Tennis", event: "Djokovic vs Alcaraz", startDate: "2026-02-22 14:00:00", status: "Enabled", openBets: 3_840 },
  { eventId: 48287, sport: "Horse Racing", event: "Cheltenham Gold Cup", startDate: "2026-02-22 13:30:00", status: "Enabled", openBets: 2_140 },
];
