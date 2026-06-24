/**
 * PLAYA BETS — Overview Dashboard Page
 * Savanna Gold design system — full-width layout, horizontal filter bar at top.
 *
 * Charts and widgets:
 * - Revenue Trends with GGR/NGR/Turnover toggle
 * - Player Acquisition chart (Trend / MoM toggle)
 * - Conversion Rate line chart
 * - Segment Distribution pie chart
 * - Summary Metrics Table (4 tabs + Export to CSV)
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getLatestDataDate, getLastUpdated } from "@/lib/apiCache";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { defaultFilters, type DashboardFilters } from "@/components/TopFiltersBar";
import { usePersistedFilters } from "@/lib/usePersistedFilters";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, TrendingUp, DollarSign, Activity,
  Zap, UserPlus, ArrowUpRight, BarChart2, Percent,
} from "lucide-react";
import {
  overviewKPIs as baseOverviewKPIs,
  revenueTrend as baseRevenueTrend,
  playerAcquisition as basePlayerAcquisition,
  revenueMetricsTrend as baseRevenueMetricsTrend,

  conversionRateTrend as baseConversionRateTrend,
  summaryMetrics as baseSummaryMetrics,
  transactionSummary as baseTransactionSummary,
  dailyTrendWithMA as baseDailyTrendWithMA,
} from "@/lib/mockData";
import { formatCompact, formatFull } from "@/lib/formatters";
import {
  filterByDateRange,
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleNumber,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";
import {
  CARD_BG,
  CHART_COLORS,
  FONT_MONO,
  FONT_SERIF,
  TT_STYLE,
  aggregateByGranularity,
  filterMonthRows,
  type MetricRow,
} from "./home/homeUtils";
import { useHomeData } from "./home/useHomeData";
import { SummaryMetricsTable } from "./home/HomeSections";
import ReportButton from "@/components/ReportButton";
import AiInsightsPanel from "@/components/AiInsightsPanel";
import type { ReportData, AiInsights } from "@/lib/generateReport";


export default function Home() {
  const [filters, setFilters] = usePersistedFilters();
  const [summaryTab, setSummaryTab] = useState<"overview" | "sport" | "casino">("overview");
  const [revenueMetric, setRevenueMetric] = useState<"ggr" | "turnover" | "ngr">("ggr");
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const {
    dataMode,
    latestDataDate,
    isLoading,
    liveOverviewKPIs,
    liveRevenueTrend,
    liveRevenueMetricsTrend,
    livePlayerAcquisition,
    livePlayerAcquisitionDaily,
    liveConversionRateTrend,
    liveSportsCasinoGgr,
    liveTransactionSummary,
    liveRangeKpis,
    hasTransactionsData,

    liveTodayKpis,
    liveSummaryMetrics,
    liveNgr,
    liveBonusSpent,
    liveFtdRegMonth,
    liveUniqueDepositors,
    liveBonusTxIssued,
    liveBonusConverted,
    liveBonusPct,
    liveChurnPct,
    liveTaxesPaid,
    liveTotalActives,
    liveTotalApd,
  } = useHomeData({ filters, setFilters });

  const showPendingOverlay = dataMode !== "live";

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

  const sourceOverviewKPIs = liveOverviewKPIs ?? baseOverviewKPIs;
  const sourceRevenueTrend = liveRevenueTrend ?? baseRevenueTrend;
  const sourceRevenueMetricsTrend = liveRevenueMetricsTrend ?? baseRevenueMetricsTrend;
  const sourcePlayerAcquisition = livePlayerAcquisition ?? basePlayerAcquisition;
  const sourceConversionRateTrend = liveConversionRateTrend ?? baseConversionRateTrend;
  const sourceTransactionSummary = liveTransactionSummary ?? baseTransactionSummary;

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

  const granularityLabel = `${filters.granularity.charAt(0).toUpperCase()}${filters.granularity.slice(1)}`;

  const playerAcquisitionDailyAgg = useMemo(() => {
    if (!livePlayerAcquisitionDaily || livePlayerAcquisitionDaily.length === 0) return null;
    return aggregateByGranularity(livePlayerAcquisitionDaily, filters.granularity, (row) => row.date, {
      labelKey: "date",
      fallbackYear,
    });
  }, [livePlayerAcquisitionDaily, filters.granularity, fallbackYear]);

  const sportsCasinoGgrAgg = useMemo(() => {
    if (!liveSportsCasinoGgr || liveSportsCasinoGgr.length === 0) return null;
    return aggregateByGranularity(liveSportsCasinoGgr, filters.granularity, (row) => row.date, {
      labelKey: "date",
      fallbackYear,
    });
  }, [liveSportsCasinoGgr, filters.granularity, fallbackYear]);

  const acqSeries = playerAcquisition.length > 0 ? playerAcquisition : sourcePlayerAcquisition;
  const fallbackMonth = { month: "-", registrations: 0, ftds: 0, vftds: 0, topFtds: 0 };
  const lastMonth = acqSeries[acqSeries.length - 1] ?? fallbackMonth;
  const kpiRegistrations = liveRangeKpis?.registrations ?? lastMonth.registrations;
  const kpiFtds = liveRangeKpis?.ftds ?? lastMonth.ftds;
  const periodConvRate =
    kpiRegistrations > 0 && liveFtdRegMonth != null
      ? Number(((liveFtdRegMonth / kpiRegistrations) * 100).toFixed(1))
      : kpiRegistrations > 0 ? Number(((kpiFtds / kpiRegistrations) * 100).toFixed(1)) : 0;



  // AI insights — fetched once all core KPIs are available for the period
  useEffect(() => {
    if (!liveNgr || !kpiRegistrations || kpiRegistrations === 0) return;
    const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
    const API_KEY_H = (import.meta.env.VITE_API_KEY as string | undefined) ?? "";
    const ggr = (overviewKPIs.totalStake ?? 0) - (overviewKPIs.totalWinnings ?? 0);
    const holdPct = overviewKPIs.totalStake > 0 ? (ggr / overviewKPIs.totalStake * 100) : 0;
    const params = new URLSearchParams({
      start: filters.dateFrom, end: filters.dateTo,
      registrations:   String(kpiRegistrations),
      ftds:            String(kpiFtds),
      conv_rate:       String(kpiRegistrations > 0 ? ((kpiFtds / kpiRegistrations) * 100).toFixed(1) : 0),
      ggr:             String(Math.round(ggr)),
      ngr:             String(Math.round(liveNgr ?? 0)),
      turnover:        String(Math.round(overviewKPIs.totalStake ?? 0)),
      hold_pct:        String(holdPct.toFixed(1)),
      deposits:        String(Math.round(transactionSummary.totalDeposits ?? 0)),
      withdrawals:     String(Math.round(transactionSummary.totalWithdrawals ?? 0)),
      net_cash:        String(Math.round((transactionSummary.totalDeposits ?? 0) - (transactionSummary.totalWithdrawals ?? 0))),
      churn_pct:       String(liveChurnPct ?? 0),
      active_players:  String((overviewKPIs.activesSports ?? 0) + (overviewKPIs.activesCasino ?? 0)),
      bonus_issued:    String(Math.round(liveBonusTxIssued ?? 0)),
      bonus_converted: String(Math.round(liveBonusConverted ?? 0)),
      avg_ftd_value:   String(Math.round(liveFtdRegMonth ?? 0)),
    });
    setAiLoading(true);
    setAiInsights(null);
    fetch(`${API_BASE}/insights/ai-summary?${params}`, {
      method: "POST",
      headers: { "Accept": "application/json", ...(API_KEY_H ? { "X-API-Key": API_KEY_H } : {}) },
    })
      .then(r => r.json())
      .then(d => { if (d.available) setAiInsights(d as AiInsights); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dateFrom, filters.dateTo, kpiRegistrations, liveNgr]);

  const reportData: ReportData = useMemo(() => {
    const stake = overviewKPIs.totalStake ?? 0;
    const winnings = overviewKPIs.totalWinnings ?? 0;
    const ggr = stake - winnings;
    return {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      dataDate: latestDataDate,
      totalBetslips: overviewKPIs.totalBetslips ?? 0,
      totalStake: stake,
      totalWinnings: winnings,
      grossMargin: stake > 0 ? ((stake - winnings) / stake) * 100 : 0,
      registrations: kpiRegistrations,
      ftds: kpiFtds,
      avgFtdValue: liveRangeKpis ? undefined : undefined, // populated from /kpis
      activePlayersSports: overviewKPIs.activesSports ?? 0,
      activePlayersCasino: overviewKPIs.activesCasino ?? 0,
      segments: [],
      casinoGGR: 0,
      casinoStake: 0,
      casinoMargin: 0,
      casinoProviderCount: 0,
      totalDeposits: transactionSummary.totalDeposits ?? 0,
      totalWithdrawals: transactionSummary.totalWithdrawals ?? 0,
      bonusesCredited: liveBonusTxIssued ?? 0,
      freebetUsagePct: 0,
      ngr: liveNgr,
      ggr,
      holdPct: stake > 0 ? (ggr / stake) * 100 : 0,
      churnPct: liveChurnPct ?? undefined,
      totalVips: undefined,
      vipGgr: undefined,
    };
  }, [filters, latestDataDate, overviewKPIs, kpiRegistrations, kpiFtds, transactionSummary, liveNgr, liveChurnPct, liveBonusTxIssued, liveRangeKpis]);

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
      subtitle="All bets are on! — Platform summary"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} resetFilters={resetFilters} />}
    >
      {/* ── HERO BANNER ─────────────────────────────────────────────────── */}
      <div
        className="relative rounded-xl overflow-hidden mb-6 p-6"
        style={{ background: "linear-gradient(135deg, #093508 0%, #1a4a10 50%, #7ab800 100%)", minHeight: "130px" }}
      >
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "repeating-linear-gradient(45deg, #ffffff 0, #ffffff 1px, transparent 0, transparent 50%)",
          backgroundSize: "12px 12px",
        }} />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#ffb500" }}>
              Playa Bets Analytics
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">
              Gaming Activity Dashboard
            </h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.70)" }}>
              Executive KPI Analytics — {filters.dateFrom} to {filters.dateTo}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: dataMode === "live" ? "#7ab800" : dataMode === "partial" ? "#ffb500" : "rgba(255,255,255,0.4)" }}>
                <span className={`w-1.5 h-1.5 rounded-full bg-current ${dataMode === "live" ? "animate-pulse" : ""}`} />
                {dataMode === "live" ? "Data Connected" : dataMode === "partial" ? "Partial Live" : "Mock Data"}
              </div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Last refresh: {getLastUpdated() ?? latestDataDate ?? "…"}</div>
            </div>
          </div>
          <div className="flex-shrink-0 mt-1">
            <ReportButton data={reportData} />
          </div>
        </div>
      </div>

      {/* ── DAILY HEALTH + PERIOD KPIs ───────────────────────────────────── */}
      {(() => {
        const TILE_BG = "#f5f9f5";
        const tile = (
          label: string,
          value: string,
          accent: string,
          icon: ReactNode,
          pending = false,
          subtitle?: string,
          tooltip?: string,
        ) => (
          <div className="rounded-lg p-2.5 relative group" style={{ background: TILE_BG, border: "1px solid #dde8dd" }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[8px] font-bold uppercase tracking-widest truncate" style={{ color: accent }}>{label}</div>
              <div style={{ color: accent, opacity: 0.65 }}>{icon}</div>
            </div>
            <div className={`text-sm font-bold leading-tight break-all ${pending ? "text-gray-300" : "text-gray-900"}`} style={FONT_MONO}>
              {value}
            </div>
            {subtitle && <div className="text-[7px] text-gray-400 leading-tight mt-0.5">{subtitle}</div>}
            {tooltip && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 rounded-md shadow-xl text-[10px] leading-snug p-2.5 z-[9999] hidden group-hover:block pointer-events-none"
                style={{ background: "#1a2e1a", color: "#e8f5e8", border: "1px solid #2d4a2d" }}>
                {tooltip}
              </div>
            )}
          </div>
        );

        const todayGGR    = liveTodayKpis ? formatFull(liveTodayKpis.ggr)          : (isLoading ? "…" : "—");
        const todayTurn   = liveTodayKpis ? formatFull(liveTodayKpis.turnover)      : (isLoading ? "…" : "—");
        const todayRegs   = liveTodayKpis ? formatFull(liveTodayKpis.registrations) : (isLoading ? "…" : "—");
        const todayDep    = liveTodayKpis
          ? (liveTodayKpis.hasTransactionsToday ? formatFull(liveTodayKpis.deposits) : "Pending")
          : (isLoading ? "…" : "—");
        const todayWd     = liveTodayKpis
          ? (liveTodayKpis.hasTransactionsToday ? formatFull(liveTodayKpis.withdrawals) : "Pending")
          : (isLoading ? "…" : "—");
        const todayBonus  = liveTodayKpis && liveTodayKpis.bonusRedeemed > 0
          ? formatFull(liveTodayKpis.bonusRedeemed)
          : (isLoading ? "…" : "—");

        return (
          <div className="flex flex-col lg:flex-row gap-4 mb-6">

            {/* ── TODAY panel ── */}
            <div className="rounded-xl overflow-hidden lg:w-[24%]" style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(90deg, #7ab800, #093508)" }}>
                <span className="text-xs font-bold uppercase tracking-widest text-white">Today</span>
                <span className="text-xs text-white/80 font-mono">{latestDataDate ?? "…"}</span>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-2 gap-2">
                  {tile("GGR",            todayGGR,   CHART_COLORS.gold,      <BarChart2 size={11} />)}
                  {tile("Turnover",       todayTurn,  "oklch(0.75 0.13 220)", <TrendingUp size={11} />)}
                  {tile("Registrations",  todayRegs,  "oklch(0.75 0.13 220)", <UserPlus size={11} />)}
                  {tile("FTDs",           liveTodayKpis ? formatFull(liveTodayKpis.ftds) : (isLoading ? "…" : "—"), CHART_COLORS.gold, <Users size={11} />)}
                  {tile("Deposits",       todayDep,   CHART_COLORS.amber,     <DollarSign size={11} />, !liveTodayKpis?.hasTransactionsToday)}
                  {tile("Withdrawals",    todayWd,    CHART_COLORS.red,       <ArrowUpRight size={11} />, !liveTodayKpis?.hasTransactionsToday)}
                  {tile("Bonus Redeemed", todayBonus, CHART_COLORS.green,     <Zap size={11} />)}
                </div>
              </div>
            </div>

            {/* ── PERIOD panel ── */}
            <div className="rounded-xl overflow-hidden lg:flex-1" style={CARD_BG}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "linear-gradient(90deg, #093508, #7ab800)" }}>
                <span className="text-xs font-bold uppercase tracking-widest text-white">Period KPIs</span>
                <span className="text-xs text-white/80 font-mono">{filters.dateFrom} → {filters.dateTo}</span>
              </div>
              <div className="p-3 space-y-3">
                {/* Revenue group — row 1: 6 tiles, row 2: 5 tiles */}
                <div>
                  <div className="grid grid-cols-6 gap-2 mb-2">
                    {tile("GGR",             formatFull(overviewKPIs.grossRevenue),                                                                          CHART_COLORS.gold,      <BarChart2 size={11} />,    false, undefined, "Gross Gaming Revenue = Total Stakes minus Total Payouts. Can be negative when players win more than they wager.")}
                    {tile("Turnover",        formatFull(overviewKPIs.totalStake),                                                                             "oklch(0.75 0.13 220)", <TrendingUp size={11} />,  false, undefined, "Total amount staked by players across Sports and Casino during the selected period.")}
                    {tile("Hold %",          overviewKPIs.totalStake > 0 ? `${((overviewKPIs.grossRevenue / overviewKPIs.totalStake) * 100).toFixed(2)}%` : "—",
                                                                                                                                                              CHART_COLORS.green,     <Percent size={11} />,     false, "GGR/Turnover", "Hold % = GGR / Turnover x 100. The percentage of turnover retained as revenue. Higher is better.")}
                    {tile("NGR",             liveNgr != null ? formatFull(liveNgr) : "—",                                                                    CHART_COLORS.green,     <TrendingUp size={11} />,  liveNgr == null, undefined, "Net Gaming Revenue = GGR minus Bonuses minus Adjustments. The cleanest measure of actual revenue retained.")}
                    {tile("Bonus Issued",    liveBonusTxIssued != null && liveBonusTxIssued > 0 ? formatFull(liveBonusTxIssued) : "—",                       CHART_COLORS.amber,     <Zap size={11} />,         !liveBonusTxIssued, undefined, "Total value of bonuses issued to players during the period (free bets + bonus credits).")}
                    {tile("Bonus Converted", liveBonusConverted != null && liveBonusConverted > 0 ? formatFull(liveBonusConverted) : "—",                     CHART_COLORS.teal,      <Zap size={11} />,         !liveBonusConverted, "ReasonID 54", "Total value of bonuses that players converted into real-money winnings (wagered through).")}
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {tile("Deposits",        hasTransactionsData ? formatFull(transactionSummary.totalDeposits)    : "Pending",                               CHART_COLORS.amber,     <DollarSign size={11} />,  !hasTransactionsData, undefined, "Sum of all player deposits (money added to accounts) during the selected period.")}
                    {tile("Withdrawals",     hasTransactionsData ? formatFull(transactionSummary.totalWithdrawals) : "Pending",                               CHART_COLORS.red,       <ArrowUpRight size={11} />,!hasTransactionsData, undefined, "Sum of all player withdrawals (money taken out of accounts) during the selected period.")}
                    {tile("Net Cash",        hasTransactionsData ? formatFull((transactionSummary as typeof transactionSummary & { netDeposits?: number }).netDeposits ?? (transactionSummary.totalDeposits - transactionSummary.totalWithdrawals)) : "Pending",
                                                                                                                                                              CHART_COLORS.teal,      <DollarSign size={11} />,  !hasTransactionsData, "Dep-Wd (accepted)", "Net Cash = Total Deposits minus Total Withdrawals. Positive means more money came in than went out.")}
                    {tile("Net Cash %",      hasTransactionsData && transactionSummary.totalDeposits > 0
                      ? `${((((transactionSummary as typeof transactionSummary & { netDeposits?: number }).netDeposits ?? (transactionSummary.totalDeposits - transactionSummary.totalWithdrawals)) / transactionSummary.totalDeposits) * 100).toFixed(1)}%`
                      : "Pending",                                                                                                                             "oklch(0.72 0.11 195)", <Percent size={11} />,     !hasTransactionsData, undefined, "Net Cash as a percentage of total deposits. Shows what proportion of deposited funds were retained.")}
                    {tile("Taxes Paid",      liveTaxesPaid != null && liveTaxesPaid > 0 ? formatFull(liveTaxesPaid) : "—",                                    CHART_COLORS.red,       <DollarSign size={11} />,  liveTaxesPaid == null, "IDType 38", "Taxes paid by players on their bets (StakeTax + WinningsTax) from the DWH.")}
                    {tile("Bonus Conv %",    liveBonusPct != null && liveBonusPct > 0 ? `${liveBonusPct}%` : "—",                                             CHART_COLORS.green,     <Percent size={11} />,     liveBonusPct == null || liveBonusPct === 0, "Converted/Issued", "Bonus Conversion Rate = Bonus Converted / Bonus Issued x 100. How effectively players are converting bonuses into real play.")}
                  </div>
                </div>
                {/* Players group — row 1: 6 tiles, row 2: 5 tiles */}
                <div className="border-t pt-3" style={{ borderColor: "#dde8dd" }}>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-2 text-gray-400">Players</div>
                  <div className="grid grid-cols-6 gap-2 mb-2">
                    {tile("Registrations",   formatFull(kpiRegistrations),                                            "oklch(0.75 0.13 220)", <UserPlus size={11} />,  false, undefined,               "Total new player accounts created during the selected period.")}
                    {tile("FTDs",            formatFull(kpiFtds),                                                     CHART_COLORS.gold,      <Users size={11} />,     false, "first dep in period",   "First Time Depositors: players whose very first ever deposit fell within this period.")}
                    {tile("FTD Reg Month",   liveFtdRegMonth != null ? formatFull(liveFtdRegMonth) : "—",             CHART_COLORS.amber,     <Users size={11} />,     liveFtdRegMonth == null, "reg'd + ever deposited", "Players who registered in this period and have ever made a deposit (lifetime). Grows over time.")}
                    {tile("Conv Rate",       `${periodConvRate}%`,                                                     CHART_COLORS.teal,      <Percent size={11} />,   false, undefined,               "Conversion Rate = FTDs / Registrations x 100. Percentage of new players who made their first deposit.")}
                    {tile("Sports Actives",  formatFull(overviewKPIs.activesSports),                                  "oklch(0.82 0.10 160)", <Activity size={11} />,  false, "period unique",          "Unique players who placed at least one real-money sports bet during the selected period.")}
                    {tile("Casino Actives",  formatFull(overviewKPIs.activesCasino),                                  CHART_COLORS.gold,      <Zap size={11} />,       false, "period unique",          "Unique players who placed at least one real-money casino bet during the selected period.")}
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {tile("Total Actives",   liveTotalActives != null ? formatFull(liveTotalActives) : formatFull(overviewKPIs.activesSports + overviewKPIs.activesCasino), CHART_COLORS.teal, <Activity size={11} />, false, "unique sports+casino", "Total unique players active across Sports and Casino. Note: a player active in both is counted once.")}
                    {tile("ARPU",            liveNgr != null && liveTotalActives != null && liveTotalActives > 0 ? formatFull(liveNgr / liveTotalActives) : "—", CHART_COLORS.green, <TrendingUp size={11} />, false, "NGR/Actives", "Average Revenue Per User = NGR / Total Active Players. Key measure of player value for the period.")}
                    {tile("Depositors",      liveUniqueDepositors != null ? formatFull(liveUniqueDepositors) : "—",                                              CHART_COLORS.amber, <DollarSign size={11} />, liveUniqueDepositors == null, "period unique", "Unique players who made at least one deposit during the selected period (not just first-timers).")}
                    {tile("Dep/Customer",    liveUniqueDepositors != null && liveUniqueDepositors > 0 && hasTransactionsData ? formatFull(transactionSummary.totalDeposits / liveUniqueDepositors) : "—", CHART_COLORS.teal, <DollarSign size={11} />, !liveUniqueDepositors, "deposits/depositor", "Average Deposit per Depositing Player = Total Deposits / Unique Depositors.")}
                    {tile("Churn %",         liveChurnPct != null ? `${liveChurnPct}%` : "—",                                                                      CHART_COLORS.red,   <Activity size={11} />, liveChurnPct == null, "left/prev actives", "Churn Rate = Players who did not return this month / Total active players in the previous month x 100.")}
                    {tile("APD",             liveTotalApd != null ? `${liveTotalApd}d` : "—",                                                                      CHART_COLORS.green, <Activity size={11} />, liveTotalApd == null, "avg play days/user", "Average Play Days per active user in the period. Measures engagement depth.")}
                  </div>
                </div>
              </div>
            </div>

          </div>
        );
      })()}

      {/* AI Insights — directly below KPI cards */}
      <AiInsightsPanel insights={aiInsights} loading={aiLoading} />

      {/* ── REVENUE TRENDS (toggle) ──────────────────────────────────────── */}
      <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900" style={FONT_SERIF}>Revenue Trends</h3>
            <p className="text-xs text-gray-500">{granularityLabel} — selected period</p>
          </div>
          <div className="flex gap-1">
            {(["ggr", "turnover", "ngr"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setRevenueMetric(m)}
                className="text-xs px-2.5 py-1 rounded font-medium transition-colors"
                style={revenueMetric === m
                  ? { background: "#7ab800", color: "#fff" }
                  : { background: "rgba(122,184,0,0.10)", color: "#5a8a00" }}
              >
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={revenueMetricsTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revMetricGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={CHART_COLORS.green} stopOpacity={0.35} />
                <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
            <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => `${formatCompact(v)}`} />
            <Area type="monotone" dataKey={revenueMetric} name={revenueMetric.toUpperCase()} stroke={CHART_COLORS.green} fill="url(#revMetricGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── PLAYER ACQUISITION (daily) + CONVERSION RATE ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Player Acquisition — daily */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900" style={FONT_SERIF}>Player Acquisition</h3>
            <p className="text-xs text-gray-500">{granularityLabel} registrations &amp; FTDs — selected period</p>
          </div>
          {playerAcquisitionDailyAgg && playerAcquisitionDailyAgg.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={playerAcquisitionDailyAgg} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={45} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatCompact(v)} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
                <Bar dataKey="registrations" name="Registrations" fill={CHART_COLORS.teal} radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="ftds" name="FTDs" stroke={CHART_COLORS.gold} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : playerAcquisition.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={playerAcquisition} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={45} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatCompact(v)} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
                <Bar dataKey="registrations" name="Registrations" fill={CHART_COLORS.teal} radius={[2, 2, 0, 0]} />
                <Bar dataKey="ftds"          name="FTDs"          fill={CHART_COLORS.gold} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-400">
              No player-acquisition data for current date range.
            </div>
          )}
        </div>

        {/* Conversion Rate */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900" style={FONT_SERIF}>Conversion Rate Trend</h3>
              <p className="text-xs text-gray-500">FTD Reg Month ÷ Registrations — selected period</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "rgba(122,184,0,0.10)", color: CHART_COLORS.gold }}>
              daily
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={conversionRateTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={40} domain={[0, "auto"]} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v) => (v == null ? "n/a" : `${v}%`)} />
              <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
              <Line type="monotone" dataKey="rate7d" name="Conv Rate" stroke={CHART_COLORS.amber} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── SPORTS vs CASINO GGR ─────────────────────────────────────────── */}
      {sportsCasinoGgrAgg && sportsCasinoGgrAgg.length > 0 && (
        <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900" style={FONT_SERIF}>Sports vs Casino GGR</h3>
            <p className="text-xs text-gray-500">{granularityLabel} GGR by vertical — selected period</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sportsCasinoGgrAgg} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatCompact(v)} />
              <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
              <Bar dataKey="sports_ggr" name="Sports GGR"  fill={CHART_COLORS.green} radius={[2, 2, 0, 0]} />
              <Bar dataKey="casino_ggr" name="Casino GGR" fill={CHART_COLORS.gold}  radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {renderSummaryMetricsTable()}


    </DashboardLayout>
  );
}
