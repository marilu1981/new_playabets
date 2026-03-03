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

// ─── Top Agents (Hierarchy) ──────────────────────────────────────────────────
export const topAgents = [
  { agentId: 10042, username: "agent_ng_master", directUsers: 842, stake: 4_200_000 },
  { agentId: 10038, username: "agent_gh_west", directUsers: 621, stake: 3_105_000 },
  { agentId: 10031, username: "agent_ke_nairobi", directUsers: 498, stake: 2_490_000 },
  { agentId: 10028, username: "agent_ug_kampala", directUsers: 384, stake: 1_920_000 },
  { agentId: 10024, username: "agent_ng_lagos2", directUsers: 312, stake: 1_560_000 },
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

// ─── Player Acquisition (Registrations vs FTDs) ─────────────────────────────
export const playerAcquisition = Array.from({ length: 12 }, (_, i) => {
  const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  const regs = [3_420, 3_810, 4_120, 3_980, 4_540, 5_210, 4_890, 5_640, 6_120, 7_840, 6_920, 5_480][i];
  const ftds = Math.round(regs * (0.38 + Math.random() * 0.08));
  return { month: months[i], registrations: regs, ftds, vftds: Math.round(ftds * 0.12), topFtds: Math.round(ftds * 0.04) };
});

// ─── GGR / NGR / Turnover Trend ───────────────────────────────────────────────
export const revenueMetricsTrend = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(2026, 1, i + 1);
  const turnover = Math.round(300_000 + Math.sin(i / 4) * 60_000 + Math.random() * 40_000);
  const ggr = Math.round(turnover * (0.13 + Math.random() * 0.04));
  const bonusCost = Math.round(ggr * (0.18 + Math.random() * 0.05));
  const ngr = ggr - bonusCost;
  return { date: date.toISOString().split("T")[0], turnover, ggr, ngr };
});

// ─── Segment Distribution (Actives) ──────────────────────────────────────────
export const segmentDistribution = [
  { segment: "Mass", count: 22_840, pct: 59.5, color: "oklch(0.62 0.17 145)" },
  { segment: "Mix", count: 9_420, pct: 24.5, color: "oklch(0.72 0.14 85)" },
  { segment: "PVIP", count: 4_210, pct: 11.0, color: "oklch(0.65 0.15 195)" },
  { segment: "VIP", count: 1_942, pct: 5.0, color: "oklch(0.72 0.17 60)" },
];

// ─── Deposit vs Withdrawal Flow ───────────────────────────────────────────────
export const depositWithdrawalFlow = Array.from({ length: 12 }, (_, i) => {
  const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  const deposits = Math.round(900_000 + Math.random() * 400_000);
  const withdrawals = Math.round(deposits * (0.68 + Math.random() * 0.12));
  return { month: months[i], deposits, withdrawals, net: deposits - withdrawals };
});

// ─── Conversion Rate Trend ────────────────────────────────────────────────────
export const conversionRateTrend = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(2026, 1, i + 1);
  return { date: date.toISOString().split("T")[0], rate: parseFloat((38 + Math.sin(i / 5) * 4 + Math.random() * 3).toFixed(1)) };
});

// ─── Summary Metrics Table ────────────────────────────────────────────────────
export const summaryMetrics = {
  overview: [
    { metric: "Registrations", current: 5_480, previous: 6_920, ytd: 57_220 },
    { metric: "FTDs", current: 2_142, previous: 2_740, ytd: 22_480 },
    { metric: "V_FTDs", current: 257, previous: 329, ytd: 2_698 },
    { metric: "Top_FTDs", current: 86, previous: 110, ytd: 899 },
    { metric: "Conversion Rate", current: 39.1, previous: 39.6, ytd: 39.3, isPercent: true },
    { metric: "Actives", current: 38_412, previous: 35_480, ytd: 38_412 },
    { metric: "Total GGR", current: 1_378_900, previous: 1_308_200, ytd: 9_842_100, isCurrency: true },
    { metric: "NGR", current: 1_130_698, previous: 1_072_724, ytd: 8_070_522, isCurrency: true },
    { metric: "Profit %", current: 14.5, previous: 13.8, ytd: 14.1, isPercent: true },
  ],
  sportDetails: [
    { metric: "Sport Bets", current: 2_847_391, previous: 2_540_000, ytd: 24_200_000 },
    { metric: "Sport Stake", current: 9_482_100, previous: 8_840_000, ytd: 78_400_000, isCurrency: true },
    { metric: "Sport Winnings", current: 8_103_200, previous: 7_580_000, ytd: 67_200_000, isCurrency: true },
    { metric: "Sport GGR", current: 1_378_900, previous: 1_260_000, ytd: 11_200_000, isCurrency: true },
    { metric: "Sport Margin", current: 14.5, previous: 14.2, ytd: 14.3, isPercent: true },
    { metric: "Avg Stake/Bet", current: 3.33, previous: 3.48, ytd: 3.24, isCurrency: true },
  ],
  casinoDetails: [
    { metric: "Casino Bets", current: 870_000, previous: 735_000, ytd: 7_420_000 },
    { metric: "Casino Stake", current: 8_699_100, previous: 7_350_000, ytd: 74_200_000, isCurrency: true },
    { metric: "Casino Winnings", current: 7_480_763, previous: 6_321_000, ytd: 63_800_000, isCurrency: true },
    { metric: "Casino GGR", current: 1_218_337, previous: 1_029_000, ytd: 10_400_000, isCurrency: true },
    { metric: "Casino Margin", current: 14.0, previous: 14.0, ytd: 14.0, isPercent: true },
    { metric: "RTP %", current: 86.0, previous: 86.0, ytd: 86.0, isPercent: true },
  ],
};

// ─── Event Program ────────────────────────────────────────────────────────────
export const upcomingEvents = [
  { eventId: 48291, sport: "Soccer", event: "Arsenal vs Chelsea", startDate: "2026-02-22 15:00:00", status: "Enabled", openBets: 8_420 },
  { eventId: 48290, sport: "Soccer", event: "Real Madrid vs Barcelona", startDate: "2026-02-22 17:00:00", status: "Enabled", openBets: 12_840 },
  { eventId: 48289, sport: "Basketball", event: "Lakers vs Warriors", startDate: "2026-02-22 20:30:00", status: "Enabled", openBets: 4_210 },
  { eventId: 48288, sport: "Tennis", event: "Djokovic vs Alcaraz", startDate: "2026-02-22 14:00:00", status: "Enabled", openBets: 3_840 },
  { eventId: 48287, sport: "Horse Racing", event: "Cheltenham Gold Cup", startDate: "2026-02-22 13:30:00", status: "Enabled", openBets: 2_140 },
];

// ─── Geographic Distribution (Territory / Country) ────────────────────────────
export const geographicDistribution = [
  { name: "Nigeria",  territory: "West Africa",     players: 68_420, ggr: 842_100, pct: 47.9 },
  { name: "Ghana",    territory: "West Africa",     players: 24_180, ggr: 298_400, pct: 16.9 },
  { name: "Kenya",    territory: "East Africa",     players: 22_840, ggr: 281_200, pct: 16.0 },
  { name: "Uganda",   territory: "East Africa",     players: 14_920, ggr: 183_800, pct: 10.4 },
  { name: "Zambia",   territory: "Southern Africa", players: 12_470, ggr: 153_400, pct: 8.7 },
];

// ─── Traffic Source Breakdown ─────────────────────────────────────────────────
export const trafficSourceBreakdown = [
  { source: "Organic",   count: 48_200, pct: 33.8, color: "oklch(0.62 0.17 145)" },
  { source: "Paid",      count: 34_100, pct: 23.9, color: "oklch(0.72 0.14 85)"  },
  { source: "Affiliate", count: 28_400, pct: 19.9, color: "oklch(0.65 0.15 195)" },
  { source: "Direct",    count: 22_800, pct: 16.0, color: "oklch(0.72 0.17 60)"  },
  { source: "Social",    count: 8_830,  pct: 6.2,  color: "oklch(0.55 0.22 25)"  },
];

// ─── Trend by Segment (GGR per segment, monthly) ─────────────────────────────
export const trendBySegment = Array.from({ length: 12 }, (_, i) => {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return {
    month: months[i],
    VIP:   Math.round(380_000 + Math.sin(i / 2) * 40_000 + Math.random() * 20_000),
    PVIP:  Math.round(210_000 + Math.sin(i / 2.5) * 25_000 + Math.random() * 15_000),
    Mass:  Math.round(520_000 + Math.sin(i / 3) * 60_000 + Math.random() * 30_000),
    Mix:   Math.round(140_000 + Math.sin(i / 4) * 18_000 + Math.random() * 10_000),
  };
});

// ─── Daily Trend with 7-day Moving Average ────────────────────────────────────
const rawDailyValues = Array.from({ length: 30 }, (_, i) => {
  const base = 45_000 + Math.sin(i / 4) * 10_000;
  return Math.round(base + (Math.random() - 0.5) * 12_000);
});

export const dailyTrendWithMA = rawDailyValues.map((val, i) => {
  const date = new Date(2026, 1, i + 1).toISOString().split("T")[0];
  const slice = rawDailyValues.slice(Math.max(0, i - 6), i + 1);
  const ma7 = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
  return { date, value: val, ma7 };
});

// ─── Detailed Breakdown Table ─────────────────────────────────────────────────
const brands    = ["PlayaBets NG", "PlayaBets GH", "PlayaBets KE", "PlayaBets UG", "PlayaBets ZM"];
const segments  = ["VIP", "PVIP", "Mass", "Mix"];
const territories = ["West Africa", "East Africa", "Southern Africa"];

export const detailedBreakdown = Array.from({ length: 20 }, (_, i) => {
  const date = new Date(2026, 1, i + 1).toISOString().split("T")[0];
  const brand     = brands[i % brands.length];
  const segment   = segments[i % segments.length];
  const territory = territories[i % territories.length];
  const value     = Math.round(40_000 + Math.random() * 120_000);
  const prev      = Math.round(value * (0.85 + Math.random() * 0.3));
  const pctChange = parseFloat(((value - prev) / prev * 100).toFixed(1));
  return { date, brand, segment, territory, value, pctChange };
});
