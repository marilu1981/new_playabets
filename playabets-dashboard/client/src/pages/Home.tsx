/**
 * PLAYA BETS — Overview Dashboard Page
 * Savanna Gold design system — full-width layout, horizontal filter bar at top.
 *
 * All charts from the client demo are preserved:
 * - 10 KPI cards (Registrations, FTDs, Top_FTDs, Actives, Deposits,
 *   Withdrawals, Turnover, GGR, NGR, Conversion Rate)
 * - Revenue Trends with GGR/NGR/Turnover toggle
 * - Player Acquisition chart (Trend / MoM toggle)
 * - Conversion Rate line chart
 * - Segment Distribution pie chart
 * - Deposit vs Withdrawal Flow bar chart
 * - Segment Performance KPI row
 * - Summary Metrics Table (4 tabs + Export to CSV)
 * - Original: Revenue Trend (Stake vs Revenue), Betslip Status pie,
 *   User Status list, Upcoming Events table
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getLatestDataDate, setLatestDataDate as persistLatestDate } from "@/lib/apiCache";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { defaultFilters, type DashboardFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import MockOverlay from "@/components/MockOverlay";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, TrendingUp, DollarSign, Activity,
  Zap, Download, UserPlus, ArrowUpRight, BarChart2, Percent, Shield, AlertTriangle,
} from "lucide-react";
import {
  overviewKPIs as baseOverviewKPIs,
  revenueTrend as baseRevenueTrend,
  betslipsByStatus as baseBetslipsByStatus,
  usersByStatus as baseUsersByStatus,
  playerAcquisition as basePlayerAcquisition,
  revenueMetricsTrend as baseRevenueMetricsTrend,
  segmentDistribution as baseSegmentDistribution,
  conversionRateTrend as baseConversionRateTrend,
  summaryMetrics as baseSummaryMetrics,
  transactionSummary as baseTransactionSummary,
  geographicDistribution as baseGeographicDistribution,
  trendBySegment as baseTrendBySegment,
  dailyTrendWithMA as baseDailyTrendWithMA,
  detailedBreakdown as baseDetailedBreakdown,
  complianceKPIs as baseComplianceKPIs,
} from "@/lib/mockData";
import { formatCompact, formatNumber } from "@/lib/formatters";
import {
  filterByDateRange,
  getFilterMultiplier,
  matchesRowFilters,
  scaleArrayNumericFields,
  scaleNumber,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";
import {
  CARD_BG,
  CHART_COLORS,
  COUNTRY_BRAND_MAP,
  FONT_MONO,
  FONT_SERIF,
  HERO_BG,
  TT_STYLE,
  aggregateByGranularity,
  fetchJson,
  filterMonthRows,
  parseSeriesDate,
  type DataMode,
  type MetricRow,
} from "./home/homeUtils";
import { useHomeData } from "./home/useHomeData";
import {
  DetailedBreakdownTable,
  HomeHeroBanner,
  HomePrimaryKpis,
  SummaryMetricsTable,
} from "./home/HomeSections";

const RFM_SEGMENTS = ["VIP", "Active", "New", "Cooling", "Lapsed", "Dormant"] as const;
const RFM_SEGMENT_COLOR_MAP: Record<(typeof RFM_SEGMENTS)[number], string> = {
  VIP:       "oklch(0.72 0.17 60)",
  Active:    "oklch(0.65 0.15 195)",
  New:       "oklch(0.62 0.17 145)",
  "Cooling": "oklch(0.72 0.14 85)",
  Lapsed:    "oklch(0.65 0.15 30)",
  Dormant:   "oklch(0.45 0.05 0)",
};

function getRfmSegmentBadgeStyle(segment: string) {
  const color = RFM_SEGMENT_COLOR_MAP[segment as keyof typeof RFM_SEGMENT_COLOR_MAP] ?? CHART_COLORS.amber;
  return {
    background: color.replace(")", " / 15%)"),
    color,
  };
}


export default function Home() {
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const cached = getLatestDataDate();
    if (cached && /^\d{4}-\d{2}-\d{2}$/.test(cached)) {
      return { ...defaultFilters, dateFrom: `${cached.slice(0, 7)}-01`, dateTo: cached };
    }
    return defaultFilters;
  });
  const [revMetric, setRevMetric] = useState<"ggr" | "ngr" | "turnover">("ggr");
  const [summaryTab, setSummaryTab] = useState<"overview" | "sport" | "casino">("overview");
  const {
    dataMode,
    latestDataDate,
    isLoading,
    liveOverviewKPIs,
    liveRevenueTrend,
    liveRevenueMetricsTrend,
    livePlayerAcquisition,
    liveConversionRateTrend,
    liveTransactionSummary,
    liveRangeKpis,
    liveNgr,
    liveBonusCoverage,
    liveBetslipsByStatus,
    liveUsersByStatus,
    liveSegmentTrend,
    hasTransactionsData,
    hasBetslipStatusData,
    hasUserStatusData,
    liveSegmentDistribution,
    hasSegmentData,
    liveTodayKpis,
    liveSummaryMetrics,
  } = useHomeData({ filters, setFilters });
/*
  const [dataMode, setDataMode] = useState<DataMode>("mock");
  const showPendingOverlay = dataMode !== "live";
  const depositFlowPending = true;
  const geoPending = true;
  const [latestDataDate, setLatestDataDate] = useState<string | null>(getLatestDataDate());
  // Start non-loading when we already have a cached date (return navigation feels instant)
  const [isLoading, setIsLoading] = useState<boolean>(getLatestDataDate() === null);

  const [liveOverviewKPIs, setLiveOverviewKPIs] = useState<typeof baseOverviewKPIs | null>(null);
  const [liveRevenueTrend, setLiveRevenueTrend] = useState<typeof baseRevenueTrend | null>(null);
  const [liveRevenueMetricsTrend, setLiveRevenueMetricsTrend] = useState<typeof baseRevenueMetricsTrend | null>(null);
  const [livePlayerAcquisition, setLivePlayerAcquisition] = useState<typeof basePlayerAcquisition | null>(null);
  const [liveConversionRateTrend, setLiveConversionRateTrend] = useState<typeof baseConversionRateTrend | null>(null);
  const [liveTransactionSummary, setLiveTransactionSummary] = useState<typeof baseTransactionSummary | null>(null);
  const [liveRangeKpis, setLiveRangeKpis] = useState<{ registrations: number; ftds: number } | null>(null);
  const [liveNgr, setLiveNgr] = useState<number | null>(null);
  const [liveBonusCoverage, setLiveBonusCoverage] = useState<{ coveredDays: number; totalDays: number } | null>(null);
  const [liveBetslipsByStatus, setLiveBetslipsByStatus] = useState<typeof baseBetslipsByStatus | null>(null);
  const [liveUsersByStatus, setLiveUsersByStatus] = useState<typeof baseUsersByStatus | null>(null);
  const [hasTransactionsData, setHasTransactionsData] = useState<boolean>(false);
  const [hasBetslipStatusData, setHasBetslipStatusData] = useState<boolean>(false);
  const [hasUserStatusData, setHasUserStatusData] = useState<boolean>(false);
  const betslipStatusPending = !hasBetslipStatusData;
  const userStatusPending = !hasUserStatusData;
  const [liveSegmentDistribution, setLiveSegmentDistribution] = useState<typeof baseSegmentDistribution | null>(null);
  const [hasSegmentData, setHasSegmentData] = useState<boolean>(false);
  const segmentPending = !hasSegmentData;
*/

  const showPendingOverlay = dataMode !== "live";
  const geoPending = true;
  const betslipStatusPending = !hasBetslipStatusData;
  const userStatusPending = !hasUserStatusData;
  const segmentPending = !hasSegmentData;

  const fallbackYear = useMemo(() => {
    const parsedYear = Number.parseInt(filters.dateTo.slice(0, 4), 10);
    return Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();
  }, [filters.dateTo]);

  const resetFilters = useMemo(() => {
    if (!latestDataDate || !/^\d{4}-\d{2}-\d{2}$/.test(latestDataDate)) {
      return defaultFilters;
    }
    const dateTo = latestDataDate;
    const dateFrom = `${dateTo.slice(0, 7)}-01`;
    return { ...defaultFilters, dateFrom, dateTo };
  }, [latestDataDate]);

  const multiplier = dataMode === "mock" ? getFilterMultiplier(filters) : 1;

/*
  useEffect(() => {
    let cancelled = false;
    fetchJson<{ date?: string }>("/kpis/latest")
      .then((latest) => {
        if (cancelled) {
          return;
        }
        const maxDate = latest.date;
        if (!maxDate || !/^\d{4}-\d{2}-\d{2}$/.test(maxDate)) {
          return;
        }
        persistLatestDate(maxDate);
        setLatestDataDate(maxDate);
        setFilters((prev) => {
          let dateTo = prev.dateTo;
          let dateFrom = prev.dateFrom;
          let changed = false;
          if (dateTo > maxDate) {
            dateTo = maxDate;
            changed = true;
          }
          if (dateFrom > dateTo) {
            dateFrom = `${dateTo.slice(0, 7)}-01`;
            changed = true;
          }
          return changed ? { ...prev, dateFrom, dateTo } : prev;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Wait until we know the latest data date before firing live data fetch.
    // Without this guard the initial call uses today's date (March 2026) which
    // returns empty rows, causing dataMode to stay "mock".
    if (latestDataDate === null) {
      return;
    }

    let cancelled = false;

    async function loadLiveData() {
      const params = new URLSearchParams({
        start: filters.dateFrom,
        end: filters.dateTo,
      });
      if (filters.brand !== "all") params.set("brand", filters.brand);
      if (filters.territory !== "all") params.set("territory", filters.territory);
      if (filters.country !== "all") params.set("country", filters.country);
      if (filters.trafficSource !== "all") params.set("traffic_source", filters.trafficSource);
      if (filters.affiliateId !== "all") params.set("affiliate_id", filters.affiliateId);
      if (filters.currentSegment !== "all") params.set("current_segment", filters.currentSegment);
      if (filters.customerStatus !== "all") params.set("customer_status", filters.customerStatus);
      if (filters.granularity) params.set("granularity", filters.granularity);
      const query = params.toString();

      // For the conversion rate rolling window, registrations must start 30 days
      // before dateFrom so the 30-day rolling average has a proper warm-up period.
      // Without this, early data points show 100% because FTDs from users who
      // registered before the filter start inflate the rate.
      // reg_start extends ONLY the registration fetch; FTDs still use the normal start.
      const regsStartDate = (() => {
        const d = new Date(`${filters.dateFrom}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 30);
        return d.toISOString().slice(0, 10);
      })();
      const regsParams = new URLSearchParams({
        start: filters.dateFrom,
        end: filters.dateTo,
        reg_start: regsStartDate,
      });
      const regsQuery = regsParams.toString();

      const requests = {
        kpis: fetchJson<{
          registrations?: number;
          actives_sports?: number;
          actives_casino?: number;
          turnover?: number;
          winnings?: number;
          ggr?: number;
          ngr?: number;
          deposits?: number;
          withdrawals?: number;
          bonus_spent?: number;
          ftds?: number;
          has_transactions_data?: boolean;
          tx_count_pending?: number;
          tx_count_accepted?: number;
          tx_count_other_status?: number;
        }>(`/kpis?${query}`),
        daily: fetchJson<{
          rows: Array<{
            date: string;
            placed_stake?: number;
            settled_stake?: number;
            settled_winnings?: number;
            ggr?: number;
            betslips_count?: number;
          }>;
        }>(
          `/kpis/daily?${query}&metrics=placed_stake,settled_stake,settled_winnings,ggr,betslips_count`
        ),
        casinoDaily: fetchJson<{ points: Array<{ date: string; stake?: number; winnings?: number; ggr?: number }> }>(
          `/casino/daily?${query}`
        ),
        bonusDaily: fetchJson<{ points: Array<{ date: string; bonus_credited?: number }> }>(`/bonus/daily?${query}`),
        registrations: fetchJson<{ registrations: Array<{ date: string; value: number }>; ftds: Array<{ date: string; value: number }> }>(
          `/timeseries/registrations?${regsQuery}`
        ),
        betslipStatus: fetchJson<Array<{ status?: string; statusId?: number | null; count?: number }>>(
          `/betting/betslips-by-status?${query}`
        ),
        userStatus: fetchJson<{ statuses: Array<{ status?: string; count?: number }> }>(
          `/users/status-breakdown?${query}`
        ),
        rfmSegments: fetchJson<{ rows: Array<{ date: string; rfm_champions?: number; rfm_loyal?: number; rfm_big_spenders?: number; rfm_mid?: number; rfm_at_risk?: number; rfm_dormant?: number }> }>(
          `/rfm/segments?start=${filters.dateFrom}&end=${filters.dateTo}`
        ),
      };

      const [
        kpisRes,
        dailyRes,
        casinoDailyRes,
        bonusDailyRes,
        regsRes,
      ] = await Promise.allSettled([
        requests.kpis,
        requests.daily,
        requests.casinoDaily,
        requests.bonusDaily,
        requests.registrations,
      ]);

      if (cancelled) {
        return;
      }

      const hasKpis = kpisRes.status === "fulfilled";
      const hasDaily = dailyRes.status === "fulfilled";
      const hasRegs = regsRes.status === "fulfilled";
      const mode: DataMode = hasKpis && hasDaily && hasRegs ? "live" : hasKpis || hasDaily || hasRegs ? "partial" : "mock";
      setDataMode(mode);
      setIsLoading(false);

      if (kpisRes.status === "fulfilled") {
        const k = kpisRes.value;
        setLiveRangeKpis({
          registrations: Number(k.registrations ?? 0),
          ftds: Number(k.ftds ?? 0),
        });
        setLiveNgr(Number(k.ngr ?? 0));
        setLiveOverviewKPIs((prev) => ({
          ...baseOverviewKPIs,
          activesSports: Number(k.actives_sports ?? 0),
          activesCasino: Number(k.actives_casino ?? 0),
          totalBetslips: prev?.totalBetslips ?? baseOverviewKPIs.totalBetslips,
          totalStake: Number(k.turnover ?? 0),
          totalWinnings: Number(k.winnings ?? Number(k.turnover ?? 0) - Number(k.ggr ?? 0)),
          grossRevenue: Number(k.ggr ?? 0),
        }));
        setHasTransactionsData(Boolean(k.has_transactions_data));
        setLiveTransactionSummary({
          ...baseTransactionSummary,
          totalDeposits: Number(k.deposits ?? 0),
          totalWithdrawals: Number(k.withdrawals ?? 0),
          pendingTransactions: Number(k.tx_count_pending ?? 0),
          acceptedToday: Number(k.tx_count_accepted ?? 0),
          refusedToday: Number(k.tx_count_other_status ?? 0),
        });
      } else {
        setLiveNgr(null);
        setLiveBonusCoverage(null);
        setHasTransactionsData(false);
        setLiveTransactionSummary(null);
      }

      if (!hasDaily) {
        return;
      }

      const dailyRows = dailyRes.value.rows ?? [];
      const sportsbookByDate = new Map<
        string,
        {
          turnover: number;
          settledStake: number;
          settledWinnings: number;
          ggr: number;
          betslipsCount: number;
        }
      >();
      for (const r of dailyRows) {
        const turnover = Number(r.placed_stake ?? 0);
        const settledStake = Number(r.settled_stake ?? turnover);
        const ggr = Number(r.ggr ?? 0);
        const settledWinnings = Number(
          r.settled_winnings ?? (Number.isFinite(ggr) ? settledStake - ggr : 0),
        );
        sportsbookByDate.set(r.date, {
          turnover,
          settledStake,
          settledWinnings,
          ggr,
          betslipsCount: Number(r.betslips_count ?? 0),
        });
      }

      const casinoByDate = new Map<string, { stake: number; winnings: number; ggr: number }>();
      if (casinoDailyRes.status === "fulfilled") {
        for (const row of casinoDailyRes.value.points ?? []) {
          casinoByDate.set(row.date, {
            stake: Number(row.stake ?? 0),
            winnings: Number(row.winnings ?? 0),
            ggr: Number(row.ggr ?? 0),
          });
        }
      }

      const bonusByDate = new Map<string, number>();
      if (bonusDailyRes.status === "fulfilled") {
        for (const p of bonusDailyRes.value.points ?? []) {
          bonusByDate.set(p.date, Number(p.bonus_credited ?? 0));
        }
      }

      const allDates = Array.from(
        new Set([
          ...Array.from(sportsbookByDate.keys()),
          ...Array.from(casinoByDate.keys()),
          ...Array.from(bonusByDate.keys()),
        ]),
      ).sort();

      const fromDt = parseIsoDate(filters.dateFrom);
      const toDt = parseIsoDate(filters.dateTo);
      const totalDays = fromDt && toDt
        ? Math.max(1, Math.floor((Math.abs(toDt.getTime() - fromDt.getTime()) / 86400000)) + 1)
        : Math.max(1, allDates.length);
      setLiveBonusCoverage({
        coveredDays: bonusByDate.size,
        totalDays,
      });

      const metrics = allDates
        .map((date) => {
          const sportsbook = sportsbookByDate.get(date) ?? {
            turnover: 0,
            settledStake: 0,
            settledWinnings: 0,
            ggr: 0,
            betslipsCount: 0,
          };
          const casino = casinoByDate.get(date) ?? { stake: 0, winnings: 0, ggr: 0 };

          const turnover = sportsbook.settledStake + casino.stake;
          const winnings = sportsbook.settledWinnings + casino.winnings;
          const ggr = sportsbook.ggr + casino.ggr;
          const ngr = ggr - Number(bonusByDate.get(date) ?? 0);

          return {
            date,
            turnover,
            winnings,
            settledStake: sportsbook.settledStake,
            settledWinnings: sportsbook.settledWinnings,
            ggr,
            ngr,
            betslips_count: sportsbook.betslipsCount,
          };
        });

      setLiveRevenueMetricsTrend(metrics.length > 0 ? metrics.map((r) => ({
        date: r.date,
        turnover: r.turnover,
        ggr: r.ggr,
        ngr: r.ngr,
      })) : null);

      setLiveRevenueTrend(metrics.length > 0 ? metrics.map((r) => ({
        date: r.date,
        stake: r.turnover,
        winnings: r.winnings,
        revenue: r.ggr,
      })) : null);

      if (kpisRes.status === "fulfilled") {
        const k = kpisRes.value;
        const totalBetslips = Array.from(sportsbookByDate.values()).reduce((sum, r) => sum + r.betslipsCount, 0);
        setLiveOverviewKPIs({
          ...baseOverviewKPIs,
          activesSports: Number(k.actives_sports ?? 0),
          activesCasino: Number(k.actives_casino ?? 0),
          totalBetslips,
          totalStake: Number(k.turnover ?? 0),
          totalWinnings: Number(k.winnings ?? Number(k.turnover ?? 0) - Number(k.ggr ?? 0)),
          grossRevenue: Number(k.ggr ?? 0),
        });
      }


      if (regsRes.status === "fulfilled") {
        const regs = regsRes.value.registrations ?? [];
        const ftds = regsRes.value.ftds ?? [];

        const ftdByDate = new Map<string, number>();
        for (const row of ftds) {
          // ftd rows use { date, value }
          ftdByDate.set(row.date, Number((row as { date: string; value?: number }).value ?? 0));
        }

        const regByDate = new Map<string, number>();
        const byMonth = new Map<string, { month: string; registrations: number; ftds: number }>();
        for (const row of regs) {
          const date = row.date;
          const dt = new Date(`${date}T00:00:00Z`);
          if (Number.isNaN(dt.getTime())) {
            continue;
          }
          // registration rows may use { date, registrations } or { date, value }
          const regValue = Number(
            (row as { date: string; registrations?: number; value?: number; count?: number }).registrations
              ?? (row as { date: string; registrations?: number; value?: number; count?: number }).value
              ?? (row as { date: string; registrations?: number; value?: number; count?: number }).count
              ?? 0,
          );
          // Always populate regByDate — even pre-filter dates — so the 30-day
          // rolling conversion rate has a proper warm-up window.
          regByDate.set(date, (regByDate.get(date) ?? 0) + regValue);
          // Only include dates within the requested range in the monthly bar chart
          // so the extended lookback doesn't add extra months.
          if (date < filters.dateFrom) continue;
          const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
          const month = dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
          const bucket = byMonth.get(key) ?? { month, registrations: 0, ftds: 0 };
          bucket.registrations += regValue;
          bucket.ftds += Number(ftdByDate.get(date) ?? 0);
          byMonth.set(key, bucket);
        }

        const monthly = Array.from(byMonth.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-12)
          .map(([, v]) => ({
            month: v.month,
            registrations: v.registrations,
            ftds: v.ftds,
            vftds: Math.round(v.ftds * 0.12),
            topFtds: Math.round(v.ftds * 0.04),
          }));
        setLivePlayerAcquisition(monthly.length > 0 ? monthly : null);

        const allDates = Array.from(new Set([...regByDate.keys(), ...ftdByDate.keys()])).sort();
        const dateRows = allDates
          .map((date) => ({ date, ts: Date.parse(`${date}T00:00:00Z`) }))
          .filter((row) => Number.isFinite(row.ts));

        const rollingRates = (windowDays: number) => {
          const limitMs = (windowDays - 1) * 86400000;
          return dateRows.map((row, idx) => {
            let regSum = 0;
            let ftdSum = 0;
            for (let j = idx; j >= 0; j -= 1) {
              if (row.ts - dateRows[j].ts > limitMs) {
                break;
              }
              regSum += regByDate.get(dateRows[j].date) ?? 0;
              ftdSum += ftdByDate.get(dateRows[j].date) ?? 0;
            }
            if (!regSum) {
              return null;
            }
            const raw = (ftdSum / regSum) * 100;
            return Number(Math.min(raw, 100).toFixed(1));
          });
        };

        const rate7d = rollingRates(7);
        const rate30d = rollingRates(30);
        const conversion = dateRows.map((row, idx) => ({
          date: row.date,
          rate7d: rate7d[idx],
          rate30d: rate30d[idx],
        }));
        setLiveConversionRateTrend(conversion.length > 0 ? conversion : null);
      }

      const [
        betslipStatusRes,
        userStatusRes,
        rfmSegmentsRes,
      ] = await Promise.allSettled([
        requests.betslipStatus,
        requests.userStatus,
        requests.rfmSegments,
      ]);

      if (cancelled) {
        return;
      }

      if (betslipStatusRes.status === "fulfilled") {
        const rows = Array.isArray(betslipStatusRes.value) ? betslipStatusRes.value : [];
        setLiveBetslipsByStatus(
          rows.map((row) => ({
            status: row.status ? String(row.status) : "Unknown",
            statusId: row.statusId ?? null,
            count: Number(row.count ?? 0),
          }))
        );
        setHasBetslipStatusData(true);
      } else {
        setLiveBetslipsByStatus(null);
        setHasBetslipStatusData(false);
      }

      if (userStatusRes.status === "fulfilled") {
        const rows = userStatusRes.value.statuses ?? [];
        setLiveUsersByStatus(
          rows.map((row) => ({
            status: row.status ? String(row.status) : "Unknown",
            count: Number(row.count ?? 0),
          }))
        );
        setHasUserStatusData(true);
      } else {
        setLiveUsersByStatus(null);
        setHasUserStatusData(false);
      }

      // Wire RFM segment distribution from live data
      // Segment colours match the design system palette
      const SEGMENT_COLORS: Record<string, string> = {
        rfm_champions:   "oklch(0.72 0.17 60)",   // gold — Champions
        rfm_loyal:       "oklch(0.65 0.15 195)",  // teal — Loyal
        rfm_big_spenders:"oklch(0.62 0.17 145)",  // green — Big Spenders
        rfm_mid:         "oklch(0.72 0.14 85)",   // amber — Mid
        rfm_at_risk:     "oklch(0.65 0.15 30)",   // orange — Cooling
        rfm_dormant:     "oklch(0.45 0.05 0)",    // muted red — Dormant
      };
      const SEGMENT_LABELS: Record<string, string> = {
        rfm_champions:   "Champions",
        rfm_loyal:       "Loyal",
        rfm_big_spenders:"Big Spenders",
        rfm_mid:         "Mid",
        rfm_at_risk:     "Cooling",
        rfm_dormant:     "Dormant",
      };
      if (rfmSegmentsRes.status === "fulfilled") {
        const rfmRows = rfmSegmentsRes.value.rows ?? [];
        // Use the latest row (highest date) that has non-zero data
        const latestRow = rfmRows
          .filter((r) => Object.keys(SEGMENT_LABELS).some((k) => Number(r[k as keyof typeof r] ?? 0) > 0))
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        if (latestRow) {
          const segments = Object.keys(SEGMENT_LABELS)
            .map((key) => ({
              segment: SEGMENT_LABELS[key],
              count: Number(latestRow[key as keyof typeof latestRow] ?? 0),
              color: SEGMENT_COLORS[key],
              pct: 0,
            }))
            .filter((s) => s.count > 0);
          const total = segments.reduce((sum, s) => sum + s.count, 0) || 1;
          const withPct = segments.map((s) => ({ ...s, pct: Number(((s.count / total) * 100).toFixed(1)) }));
          setLiveSegmentDistribution(withPct);
          setHasSegmentData(true);
        } else {
          setLiveSegmentDistribution(null);
          setHasSegmentData(false);
        }
      } else {
        setLiveSegmentDistribution(null);
        setHasSegmentData(false);
      }
    }

    loadLiveData().catch(() => {
      if (!cancelled) {
        setDataMode("mock");
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    latestDataDate,
    filters.dateFrom,
    filters.dateTo,
    filters.brand,
    filters.territory,
    filters.country,
    filters.trafficSource,
    filters.affiliateId,
    filters.currentSegment,
    filters.customerStatus,
    filters.granularity,
  ]);
*/

  const sourceOverviewKPIs = liveOverviewKPIs ?? baseOverviewKPIs;
  const sourceRevenueTrend = liveRevenueTrend ?? baseRevenueTrend;
  const sourceRevenueMetricsTrend = liveRevenueMetricsTrend ?? baseRevenueMetricsTrend;
  const sourcePlayerAcquisition = livePlayerAcquisition ?? basePlayerAcquisition;
  const sourceConversionRateTrend = liveConversionRateTrend ?? baseConversionRateTrend;
  const sourceTransactionSummary = liveTransactionSummary ?? baseTransactionSummary;
  const sourceBetslipsByStatus = liveBetslipsByStatus ?? baseBetslipsByStatus;
  const sourceUsersByStatus = liveUsersByStatus ?? baseUsersByStatus;

  const overviewKPIs = useMemo(
    () => scaleObjectNumericFields(sourceOverviewKPIs, multiplier, ["currency"]),
    [multiplier, sourceOverviewKPIs],
  );
  const revenueTrend = useMemo(() => {
    const scaled = scaleArrayNumericFields(
      filterByDateRange(sourceRevenueTrend, filters, (row) => row.date),
      multiplier,
      ["date"],
    );
    return aggregateByGranularity(scaled, filters.granularity, (row) => row.date, {
      labelKey: "date",
      fallbackYear,
    });
  }, [fallbackYear, filters, multiplier, sourceRevenueTrend]);
  const betslipsByStatus = useMemo(
    () => scaleArrayNumericFields(sourceBetslipsByStatus, multiplier, ["status", "statusId"]),
    [multiplier, sourceBetslipsByStatus],
  );
  const usersByStatus = useMemo(
    () => scaleArrayNumericFields(sourceUsersByStatus, multiplier, ["status", "statusId"]),
    [multiplier, sourceUsersByStatus],
  );
  const playerAcquisition = useMemo(
    () => scaleArrayNumericFields(
      filterMonthRows(sourcePlayerAcquisition, filters, (row) => row.month, fallbackYear),
      multiplier,
      ["month"],
    ),
    [filters, fallbackYear, multiplier, sourcePlayerAcquisition],
  );
  const revenueMetricsTrend = useMemo(() => {
    const scaled = scaleArrayNumericFields(
      filterByDateRange(sourceRevenueMetricsTrend, filters, (row) => row.date),
      multiplier,
      ["date"],
    );
    return aggregateByGranularity(scaled, filters.granularity, (row) => row.date, {
      labelKey: "date",
      fallbackYear,
    });
  }, [fallbackYear, filters, multiplier, sourceRevenueMetricsTrend]);
  const stakeVsRevenueTrend = useMemo(() => {
    if (revenueMetricsTrend.length > 0) {
      return revenueMetricsTrend.map((row) => ({
        date: row.date,
        stake: Number(row.turnover ?? 0),
        winnings: Number((row.turnover ?? 0) - (row.ggr ?? 0)),
        revenue: Number(row.ggr ?? 0),
      }));
    }
    return revenueTrend;
  }, [revenueMetricsTrend, revenueTrend]);
  const segmentDistribution = useMemo(() => {
    const source = liveSegmentDistribution ?? baseSegmentDistribution;
    const filtered = source.filter((row) =>
      filters.currentSegment === "all" ? true : row.segment === filters.currentSegment
    );
    const scaled = liveSegmentDistribution
      ? filtered  // live data is already computed — don't scale with mock multiplier
      : scaleArrayNumericFields(filtered, multiplier, ["segment", "color", "pct"]);
    const total = scaled.reduce((sum, row) => sum + row.count, 0) || 1;
    return scaled.map((row) => ({
      ...row,
      pct: Number(((row.count / total) * 100).toFixed(1)),
    }));
  }, [filters, liveSegmentDistribution, multiplier]);
  const conversionRateTrend = useMemo(() => {
    const filtered = filterByDateRange(sourceConversionRateTrend, filters, (row) => row.date);
    const normalized = filtered.map((row) => {
      const cast = row as { rate?: number; rate7d?: number | null; rate30d?: number | null };
      if (cast.rate7d === undefined && cast.rate30d === undefined && typeof cast.rate === "number") {
        return { ...row, rate7d: cast.rate, rate30d: cast.rate };
      }
      return row;
    });
    // Rates are percentages — exclude from scaling (multiplier applies to counts, not ratios)
    return aggregateByGranularity(normalized, filters.granularity, (row) => row.date, {
      labelKey: "date",
      fallbackYear,
      avgFields: ["rate7d", "rate30d"],
    });
  }, [fallbackYear, filters, sourceConversionRateTrend]);
  const summaryMetrics = useMemo(() => {
    if (liveSummaryMetrics) {
      return liveSummaryMetrics;
    }
    const scaleMetricRows = (rows: typeof baseSummaryMetrics.overview) =>
      rows.map((row) => ({
        ...row,
        current: scaleNumber(row.current, multiplier),
        previous: scaleNumber(row.previous, multiplier),
        ytd: scaleNumber(row.ytd, multiplier),
      }));
    return {
      overview: scaleMetricRows(baseSummaryMetrics.overview),
      sport: scaleMetricRows(baseSummaryMetrics.sportDetails),
      casino: scaleMetricRows(baseSummaryMetrics.casinoDetails),
    };
  }, [liveSummaryMetrics, multiplier]);
  const transactionSummary = useMemo(
    () => scaleObjectNumericFields(sourceTransactionSummary, multiplier),
    [multiplier, sourceTransactionSummary],
  );
  const geographicDistribution = useMemo(() => {
    const filtered = baseGeographicDistribution.filter((row) =>
      matchesRowFilters(filters, {
        brand: COUNTRY_BRAND_MAP[row.name],
        territory: row.territory,
        country: row.name,
      }),
    );
    return scaleArrayNumericFields(filtered, multiplier, ["name", "territory", "pct"]);
  }, [filters, multiplier]);
  const trendBySegment = useMemo(() => {
    if (liveSegmentTrend && liveSegmentTrend.length > 0) {
      const filtered = filterByDateRange(liveSegmentTrend, filters, (row) => row.date);
      const scaled = scaleArrayNumericFields(filtered, multiplier, ["date"]);
      const scoped = scaled.map((row) => {
        if (filters.currentSegment === "all") {
          return row;
        }
        const out = { ...row };
        RFM_SEGMENTS.forEach((segment) => {
          if (segment !== filters.currentSegment) {
            out[segment] = 0;
          }
        });
        return out;
      });
      return aggregateByGranularity(scoped, filters.granularity, (row) => row.date, {
        labelKey: "date",
        fallbackYear,
      });
    }
    const monthFiltered = filterMonthRows(baseTrendBySegment, filters, (row) => row.month, fallbackYear);
    const scaled = scaleArrayNumericFields(monthFiltered, multiplier, ["month"]);
    return scaled.map((row) => {
      const out = { ...row } as Record<string, unknown>;
      const segmentFilters = [filters.currentSegment].filter((value) => value !== "all");
      if (segmentFilters.length > 0) {
        RFM_SEGMENTS.forEach((segment) => {
          if (!segmentFilters.some((value) => value === segment)) {
            out[segment] = 0;
          }
        });
      }
      return out;
    });
  }, [fallbackYear, filters, liveSegmentTrend, multiplier]);
  const dailyTrendWithMA = useMemo(() => {
    const base =
      sourceRevenueMetricsTrend.length > 0
        ? sourceRevenueMetricsTrend.map((row) => ({
            date: row.date,
            value: Number(row.ggr ?? 0),
          }))
        : baseDailyTrendWithMA;
    const filtered = filterByDateRange(base, filters, (row) => row.date).sort((a, b) => a.date.localeCompare(b.date));
    const withMa = filtered.map((row, idx) => {
      const start = Math.max(0, idx - 6);
      const window = filtered.slice(start, idx + 1);
      const avg = window.reduce((sum, r) => sum + Number(r.value ?? 0), 0) / window.length;
      return {
        ...row,
        value: Number(row.value ?? 0),
        ma7: Number(avg.toFixed(2)),
      };
    });
    const scaled = scaleArrayNumericFields(withMa, multiplier, ["date"]);
    return aggregateByGranularity(scaled, filters.granularity, (row) => row.date, {
      labelKey: "date",
      fallbackYear,
      avgFields: ["value", "ma7"],
    });
  }, [fallbackYear, filters, multiplier, sourceRevenueMetricsTrend]);

  const turnoverWithMA = useMemo(() => {
    const base = revenueMetricsTrend.map((row) => ({
      date: row.date,
      turnover: Number(row.turnover ?? 0),
    }));
    return base.map((row, idx) => {
      const start = Math.max(0, idx - 6);
      const window = base.slice(start, idx + 1);
      const avg = window.reduce((sum, r) => sum + r.turnover, 0) / window.length;
      return { ...row, ma7: Number(avg.toFixed(2)) };
    });
  }, [revenueMetricsTrend]);

  const detailedBreakdown = useMemo(() => {
    const dateFiltered = filterByDateRange(baseDetailedBreakdown, filters, (row) => row.date);
    const categorized = dateFiltered.filter((row) =>
      matchesRowFilters(filters, {
        brand: row.brand,
        territory: row.territory,
        segment: row.segment,
      }),
    );
    return scaleArrayNumericFields(
      categorized,
      multiplier,
      ["date", "brand", "segment", "territory", "pctChange"],
    );
  }, [filters, multiplier]);

  const margin = overviewKPIs.totalStake > 0
    ? ((overviewKPIs.totalStake - overviewKPIs.totalWinnings) / overviewKPIs.totalStake * 100).toFixed(1)
    : "0.0";
  const granularityLabel = `${filters.granularity.charAt(0).toUpperCase()}${filters.granularity.slice(1)}`;
  const pendingDataItems = [
    !hasTransactionsData ? "transactions" : null,
    !hasBetslipStatusData ? "betslip status" : null,
    "segment and geographic widgets",
  ].filter((item): item is string => Boolean(item));
  const ngrCardValue =
    liveNgr !== null
      ? formatCompact(Math.round(liveNgr))
      : dataMode === "mock"
        ? formatCompact(Math.round(overviewKPIs.grossRevenue * 0.82))
        : "Pending";
  const ngrCardSubtitle =
    liveNgr !== null
      ? `GGR - Bonus Cost${
        liveBonusCoverage
          ? ` | Bonus coverage ${liveBonusCoverage.coveredDays}/${liveBonusCoverage.totalDays} days`
          : ""
      }`
      : dataMode === "mock"
        ? "Estimated (mock mode)"
        : "Waiting for KPI endpoint";

  const acqSeries = playerAcquisition.length > 0 ? playerAcquisition : sourcePlayerAcquisition;
  const convSeries = conversionRateTrend.length > 0 ? conversionRateTrend : sourceConversionRateTrend;
  const fallbackMonth = { month: "-", registrations: 0, ftds: 0, vftds: 0, topFtds: 0 };
  const lastMonth = acqSeries[acqSeries.length - 1] ?? fallbackMonth;
  const kpiRegistrations = liveRangeKpis?.registrations ?? lastMonth.registrations;
  const kpiFtds = liveRangeKpis?.ftds ?? lastMonth.ftds;
  const periodConvRate =
    kpiRegistrations > 0 ? Number(((kpiFtds / kpiRegistrations) * 100).toFixed(1)) : 0;
  const complianceAlerts = useMemo(
    () => scaleObjectNumericFields(baseComplianceKPIs, multiplier),
    [multiplier],
  );


  const getSummaryRows = (): MetricRow[] => {
    if (summaryTab === "sport")  return summaryMetrics.sport;
    if (summaryTab === "casino") return summaryMetrics.casino;
    return summaryMetrics.overview;
  };
  const summaryRows = getSummaryRows();
  const renderSummaryMetricsTable = () => (
    <SummaryMetricsTable
      summaryTab={summaryTab}
      setSummaryTab={setSummaryTab}
      summaryRows={summaryRows}
      isLive={!!liveSummaryMetrics}
      exportFilename={`playabets_summary_${summaryTab}_${filters.dateFrom}_${filters.dateTo}.csv`}
      cardBg={CARD_BG}
      chartColors={CHART_COLORS}
      fontSerif={FONT_SERIF}
      fontMono={FONT_MONO}
    />
  );

  return (
    <DashboardLayout
      title="Executive Overview"
      subtitle="All bets are on! — Live platform summary"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} resetFilters={resetFilters} />}
    >
      {/* ── HERO BANNER ─────────────────────────────────────────────────── */}
      <div
        className="relative rounded-xl overflow-hidden mb-6 p-6"
        style={{ backgroundImage: `url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center 40%", minHeight: "130px" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        <div className="relative z-10">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: CHART_COLORS.gold }}>
            Playa Bets Analytics
          </div>
          <h2 className="text-2xl font-bold text-white mb-1" style={FONT_SERIF}>
            Gaming Activity Dashboard
          </h2>
          <p className="text-sm text-white/60 max-w-lg">
            Executive KPI Analytics — {filters.dateFrom} to {filters.dateTo} · {granularityLabel} view
          </p>
          {latestDataDate && (
            <p className="text-xs text-white/45 mt-1">Data available through {latestDataDate}</p>
          )}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "oklch(0.75 0.17 145)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              DWH Connected ({dataMode === "live" ? "Live" : dataMode === "partial" ? "Partial Live" : "Mock"})
            </div>
            <div className="text-xs text-white/40">Last refresh: just now</div>
          </div>
          {dataMode !== "mock" && (
            <div className="text-xs text-white/45 mt-2">
              Pending: {pendingDataItems.join(", ")}.
            </div>
          )}
        </div>
      </div>

      {/* ── DAILY HEALTH + PERIOD KPIs ───────────────────────────────────── */}
      {(() => {
        const TILE_BG = "rgba(0,0,0,0.18)";
        const tile = (
          label: string,
          value: string,
          accent: string,
          icon: ReactNode,
          pending = false,
        ) => (
          <div className="rounded-lg p-2.5" style={{ background: TILE_BG }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[8px] font-bold uppercase tracking-widest truncate" style={{ color: accent }}>{label}</div>
              <div style={{ color: accent, opacity: 0.55 }}>{icon}</div>
            </div>
            <div className={`text-base font-bold leading-tight ${pending ? "text-white/30" : "text-white"}`} style={FONT_MONO}>
              {value}
            </div>
          </div>
        );

        const todayGGR     = liveTodayKpis ? formatCompact(liveTodayKpis.ggr)          : (isLoading ? "…" : "—");
        const todayTurn    = liveTodayKpis ? formatCompact(liveTodayKpis.turnover)      : (isLoading ? "…" : "—");
        const todayRegs    = liveTodayKpis ? formatCompact(liveTodayKpis.registrations) : (isLoading ? "…" : "—");
        const todaySports  = liveTodayKpis ? formatCompact(liveTodayKpis.activeSports)  : (isLoading ? "…" : "—");
        const todayCasino  = liveTodayKpis ? formatCompact(liveTodayKpis.activeCasino)  : (isLoading ? "…" : "—");

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

            {/* ── TODAY panel ── */}
            <div className="rounded-xl overflow-hidden" style={{ background: "#115F32", border: "1px solid #1e7a40" }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "#0D4726" }}>
                <span className="text-xs font-bold uppercase tracking-widest text-white/90">Today</span>
                <span className="text-xs text-white/70 font-mono">{latestDataDate ?? "…"}</span>
              </div>
              <div className="p-3">
                {/* Alerts */}
                <div className="mb-3">
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>Alerts &amp; Flags</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: TILE_BG }}>
                      <div className="flex items-center gap-1.5">
                        <Shield size={10} style={{ color: CHART_COLORS.red }} />
                        <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: CHART_COLORS.red }}>AML Alerts</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-white">{formatCompact(complianceAlerts.amlAlerts)}</span>
                    </div>
                    <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: TILE_BG }}>
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={10} style={{ color: CHART_COLORS.amber }} />
                        <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: CHART_COLORS.amber }}>Flagged Tx</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-white">{formatCompact(complianceAlerts.flaggedTransactions)}</span>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                  <div className="grid grid-cols-3 gap-2">
                    {tile("GGR",            todayGGR,              CHART_COLORS.gold,            <BarChart2 size={11} />)}
                    {tile("Turnover",       todayTurn,             "oklch(0.75 0.13 220)",       <TrendingUp size={11} />)}
                    {tile("Deposits",       "Pending",             CHART_COLORS.amber,           <DollarSign size={11} />, true)}
                    {tile("Registrations",  todayRegs,             "oklch(0.75 0.13 220)",       <UserPlus size={11} />)}
                    {tile("Conv Rate",      `${periodConvRate}%`,  CHART_COLORS.amber,           <Percent size={11} />)}
                    {tile("Sports Actives", todaySports,           "oklch(0.82 0.10 160)",       <Activity size={11} />)}
                    {tile("Casino Actives", todayCasino,           CHART_COLORS.gold,            <Zap size={11} />)}
                  </div>
                </div>
              </div>
            </div>

            {/* ── PERIOD panel ── */}
            <div className="rounded-xl overflow-hidden" style={CARD_BG}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "oklch(0.42 0.13 195)" }}>
                <span className="text-xs font-bold uppercase tracking-widest text-white/90">Period KPIs</span>
                <span className="text-xs text-white/70 font-mono">{filters.dateFrom} → {filters.dateTo}</span>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-3 gap-2">
                  {tile("GGR",            formatCompact(overviewKPIs.grossRevenue),                                                    CHART_COLORS.gold,      <BarChart2 size={11} />)}
                  {tile("Turnover",       formatCompact(overviewKPIs.totalStake),                                                       "oklch(0.75 0.13 220)", <TrendingUp size={11} />)}
                  {tile("Deposits",       hasTransactionsData ? formatCompact(transactionSummary.totalDeposits)  : "Pending",           CHART_COLORS.amber,     <DollarSign size={11} />, !hasTransactionsData)}
                  {tile("Registrations",  formatCompact(kpiRegistrations),                                                              "oklch(0.75 0.13 220)", <UserPlus size={11} />)}
                  {tile("FTDs",           formatCompact(kpiFtds),                                                                       CHART_COLORS.gold,      <Users size={11} />)}
                  {tile("Conv Rate",      `${periodConvRate}%`,                                                                         CHART_COLORS.amber,     <Percent size={11} />)}
                  {tile("Sports Actives", formatCompact(overviewKPIs.activesSports),                                                    "oklch(0.82 0.10 160)", <Activity size={11} />)}
                  {tile("Casino Actives", formatCompact(overviewKPIs.activesCasino),                                                    CHART_COLORS.gold,      <Zap size={11} />)}
                  {tile("Withdrawals",    hasTransactionsData ? formatCompact(transactionSummary.totalWithdrawals) : "Pending",         CHART_COLORS.red,       <ArrowUpRight size={11} />, !hasTransactionsData)}
                </div>
              </div>
            </div>

          </div>
        );
      })()}

      <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Daily Turnover</h3>
            <p className="text-xs text-white/40">{granularityLabel} total stakes (Sports + Casino) — selected period</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: CHART_COLORS.teal }}>7-day MA</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={turnoverWithMA} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="turnoverGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART_COLORS.teal} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS.teal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
            <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => `${formatCompact(v)}`} />
            <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
            <Area type="monotone" dataKey="turnover" name="Daily Turnover" stroke={CHART_COLORS.teal} fill="url(#turnoverGrad)" strokeWidth={1.5} dot={false} strokeOpacity={0.7} />
            <Line type="monotone" dataKey="ma7" name="7-day MA" stroke={CHART_COLORS.gold} strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── DAILY GGR — GROSS GAMING REVENUE ────────────────────────────── */}
      <div className="relative rounded-xl p-5 mb-4" style={CARD_BG}>
        <MockOverlay active={showPendingOverlay} description="Daily GGR pending live data" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Daily Gross Gaming Revenue (GGR)</h3>
            <p className="text-xs text-white/40">GGR = total stakes minus total winnings paid — {granularityLabel} view with 7-day moving average</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: CHART_COLORS.teal }}>7-day MA</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dailyTrendWithMA} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
            <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => `${formatCompact(v)}`} />
            <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
            <Line type="monotone" dataKey="value" name="Daily GGR" stroke={CHART_COLORS.gold} strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
            <Line type="monotone" dataKey="ma7"   name="7-day MA"  stroke={CHART_COLORS.teal} strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── STAKE VS REVENUE ─────────────────────────────────────────────── */}
      <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Stake vs Revenue</h3>
          <p className="text-xs text-white/40">Daily settled stake vs Gross Gaming Revenue — selected period</p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={stakeVsRevenueTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="stakeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART_COLORS.gold}  stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS.gold}  stopOpacity={0} />
              </linearGradient>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART_COLORS.green} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
            <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => `${formatCompact(v)}`} />
            <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
            <Area type="monotone" dataKey="stake"   name="Stake"   stroke={CHART_COLORS.gold}  fill="url(#stakeGrad)"   strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="revenue" name="Revenue (GGR)" stroke={CHART_COLORS.green} fill="url(#revenueGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── PLAYER ACQUISITION + CONVERSION RATE ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Player Acquisition */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Monthly Player Acquisition</h3>
              <p className="text-xs text-white/40">Registrations vs FTDs</p>
            </div>
          </div>
          {playerAcquisition.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={playerAcquisition} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={45} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatCompact(v)} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
                <Bar dataKey="registrations" name="Registrations" fill={CHART_COLORS.teal}  radius={[2, 2, 0, 0]} />
                <Bar dataKey="ftds"          name="FTDs"          fill={CHART_COLORS.gold}  radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center text-xs text-white/50">
              No player-acquisition rows for current date range.
            </div>
          )}
        </div>

        {/* Conversion Rate */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Conversion Rate</h3>
              <p className="text-xs text-white/40">Registration → FTD rate ({filters.granularity})</p>
              <p className="text-[10px] text-white/35 mt-1">
                FTDs ÷ registrations: 7d = users who registered and made their first deposit within 7 days
                (dated to registration day). 30d = same within 30 days.
              </p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "oklch(0.72 0.14 85 / 15%)", color: CHART_COLORS.gold }}>
              7d / 30d
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={conversionRateTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={40} domain={[0, 100]} />
              <Tooltip
                contentStyle={TT_STYLE}
                formatter={(v) => (v == null ? "n/a" : `${v}%`)}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
              <Line type="monotone" dataKey="rate7d"  name="7d Conversion"  stroke={CHART_COLORS.amber} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="rate30d" name="30d Conversion" stroke={CHART_COLORS.teal}  strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── SEGMENT DISTRIBUTION + DEPOSIT VS WITHDRAWAL ─────────────────── */}
      <div className="mb-4">
        {/* Segment Distribution */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={segmentPending} label="RFM Pending" description="Live RFM segment snapshot pending" />
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Segment Distribution — Actives</h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">{segmentPending ? "Pending live RFM" : "Live RFM snapshot"}</p>
            <p className="text-xs text-white/40">RFM analysis will categorise players into: VIP · Active · New · Cooling · Lapsed · Dormant</p>
          </div>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={segmentDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="count" nameKey="segment" paddingAngle={2}>
                  {segmentDistribution.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCompact(v)} contentStyle={TT_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2.5">
              {segmentDistribution.map((s) => (
                <div key={s.segment} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-xs text-white/70 font-medium">{s.segment}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono text-white/80" style={FONT_MONO}>{formatCompact(s.count)}</span>
                    <span className="text-xs text-white/40 ml-1">({s.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>


      {renderSummaryMetricsTable()}

    </DashboardLayout>
  );
}
