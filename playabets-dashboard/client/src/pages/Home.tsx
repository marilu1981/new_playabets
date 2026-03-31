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

import { useMemo, useState, type ReactNode } from "react";
import { getLatestDataDate, getLastUpdated } from "@/lib/apiCache";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { defaultFilters, type DashboardFilters } from "@/components/TopFiltersBar";
import MockOverlay from "@/components/MockOverlay";
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
  segmentDistribution as baseSegmentDistribution,
  conversionRateTrend as baseConversionRateTrend,
  summaryMetrics as baseSummaryMetrics,
  transactionSummary as baseTransactionSummary,
  dailyTrendWithMA as baseDailyTrendWithMA,
} from "@/lib/mockData";
import { formatCompact } from "@/lib/formatters";
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
  HERO_BG,
  TT_STYLE,
  aggregateByGranularity,
  filterMonthRows,
  type MetricRow,
} from "./home/homeUtils";
import { useHomeData } from "./home/useHomeData";
import { SummaryMetricsTable } from "./home/HomeSections";
import ReportButton from "@/components/ReportButton";
import type { ReportData } from "@/lib/generateReport";


export default function Home() {
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const cached = getLatestDataDate();
    if (cached && /^\d{4}-\d{2}-\d{2}$/.test(cached)) {
      return { ...defaultFilters, dateFrom: `${cached.slice(0, 7)}-01`, dateTo: cached };
    }
    return defaultFilters;
  });
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
    hasTransactionsData,
    liveSegmentDistribution,
    hasSegmentData,
    liveTodayKpis,
    liveSummaryMetrics,
    liveNgr,
  } = useHomeData({ filters, setFilters });

  const showPendingOverlay = dataMode !== "live";
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

  const acqSeries = playerAcquisition.length > 0 ? playerAcquisition : sourcePlayerAcquisition;
  const fallbackMonth = { month: "-", registrations: 0, ftds: 0, vftds: 0, topFtds: 0 };
  const lastMonth = acqSeries[acqSeries.length - 1] ?? fallbackMonth;
  const kpiRegistrations = liveRangeKpis?.registrations ?? lastMonth.registrations;
  const kpiFtds = liveRangeKpis?.ftds ?? lastMonth.ftds;
  const periodConvRate =
    kpiRegistrations > 0 ? Number(((kpiFtds / kpiRegistrations) * 100).toFixed(1)) : 0;



  const reportData: ReportData = useMemo(() => {
    const stake = overviewKPIs.totalStake ?? 0;
    const winnings = overviewKPIs.totalWinnings ?? 0;
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
      activePlayersSports: overviewKPIs.activesSports ?? 0,
      activePlayersCasino: overviewKPIs.activesCasino ?? 0,
      segments: segmentDistribution.map((s) => ({ segment: s.segment, count: s.count, pct: s.pct })),
      casinoGGR: 0,
      casinoStake: 0,
      casinoMargin: 0,
      casinoProviderCount: 0,
      totalDeposits: transactionSummary.totalDeposits ?? 0,
      totalWithdrawals: transactionSummary.totalWithdrawals ?? 0,
      bonusesCredited: 0,
      freebetUsagePct: 0,
      ngr: liveNgr,
    };
  }, [filters, latestDataDate, overviewKPIs, kpiRegistrations, kpiFtds, segmentDistribution, transactionSummary, liveNgr]);

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
            Executive KPI Analytics — {filters.dateFrom} to {filters.dateTo}
          </p>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "oklch(0.75 0.17 145)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Data Connected
            </div>
            <div className="text-xs text-white/40">Last refresh: {getLastUpdated() ?? latestDataDate ?? "…"}</div>
            <ReportButton data={reportData} />
          </div>
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
          subtitle?: string,
        ) => (
          <div className="rounded-lg p-2.5" style={{ background: TILE_BG }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[8px] font-bold uppercase tracking-widest truncate" style={{ color: accent }}>{label}</div>
              <div style={{ color: accent, opacity: 0.55 }}>{icon}</div>
            </div>
            <div className={`text-lg font-bold leading-tight ${pending ? "text-white/30" : "text-white"}`} style={FONT_MONO}>
              {value}
            </div>
            {subtitle && <div className="text-[7px] text-white/35 leading-tight mt-0.5">{subtitle}</div>}
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
            <div className="rounded-xl overflow-hidden" style={{ background: "#03190C", border: "1px solid #004e21" }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: "#073300" }}>
                <span className="text-xs font-bold uppercase tracking-widest text-white/90">Today</span>
                <span className="text-xs text-white/70 font-mono">{latestDataDate ?? "…"}</span>
              </div>
              <div className="p-3">
                <div className="pt-1" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                  <div className="grid grid-cols-3 gap-2">
                    {tile("GGR",            todayGGR,             CHART_COLORS.gold,          <BarChart2 size={11} />)}
                    {tile("Turnover",       todayTurn,            "oklch(0.75 0.13 220)",     <TrendingUp size={11} />)}
                    {tile("Registrations",  todayRegs,            "oklch(0.75 0.13 220)",     <UserPlus size={11} />)}
                    {tile("Conv Rate",      `${periodConvRate}%`, CHART_COLORS.amber,         <Percent size={11} />)}
                    {tile("Sports Actives", todaySports,          "oklch(0.82 0.10 160)",     <Activity size={11} />)}
                    {tile("Casino Actives", todayCasino,          CHART_COLORS.gold,          <Zap size={11} />)}
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
              <div className="p-3 space-y-3">
                {/* Revenue group */}
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>Revenue</div>
                  <div className="grid grid-cols-4 gap-2">
                    {tile("GGR",         formatCompact(overviewKPIs.grossRevenue),                                              CHART_COLORS.gold,      <BarChart2 size={11} />)}
                    {tile("Turnover",    formatCompact(overviewKPIs.totalStake),                                                 "oklch(0.75 0.13 220)", <TrendingUp size={11} />)}
                    {tile("Deposits",    hasTransactionsData ? formatCompact(transactionSummary.totalDeposits)  : "Pending",    CHART_COLORS.amber,     <DollarSign size={11} />, !hasTransactionsData)}
                    {tile("Withdrawals", hasTransactionsData ? formatCompact(transactionSummary.totalWithdrawals) : "Pending",  CHART_COLORS.red,       <ArrowUpRight size={11} />, !hasTransactionsData)}
                  </div>
                </div>
                {/* Players group */}
                <div className="border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>Players</div>
                  <div className="grid grid-cols-5 gap-2">
                    {tile("Registrations",  formatCompact(kpiRegistrations),                   "oklch(0.75 0.13 220)", <UserPlus size={11} />)}
                    {tile("FTDs",           formatCompact(kpiFtds),                            CHART_COLORS.gold,      <Users size={11} />)}
                    {tile("Conv Rate",      `${periodConvRate}%`,                              CHART_COLORS.amber,     <Percent size={11} />)}
                    {tile("Sports Actives", formatCompact(overviewKPIs.activesSports),         "oklch(0.82 0.10 160)", <Activity size={11} />, false, "avg daily unique")}
                    {tile("Casino Actives", formatCompact(overviewKPIs.activesCasino),         CHART_COLORS.gold,      <Zap size={11} />,      false, "avg daily unique")}
                  </div>
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
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={40} domain={[0, "auto"]} />
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
          <MockOverlay active={segmentPending} label="RFM Pending" description="RFM segment snapshot pending" />
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Segment Distribution — Actives</h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">{segmentPending ? "Pending RFM" : "RFM snapshot"}</p>
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
