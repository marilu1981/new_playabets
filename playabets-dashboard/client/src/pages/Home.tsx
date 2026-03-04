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

import { useEffect, useMemo, useState } from "react";
import { cachedFetch, getLatestDataDate, setLatestDataDate as persistLatestDate } from "@/lib/apiCache";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { defaultFilters, type DashboardFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import MockOverlay from "@/components/MockOverlay";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, TrendingUp, DollarSign, Activity,
  Zap, Download, UserPlus, ArrowUpRight, BarChart2, Percent,
} from "lucide-react";
import {
  overviewKPIs as baseOverviewKPIs,
  revenueTrend as baseRevenueTrend,
  betslipsByStatus as baseBetslipsByStatus,
  usersByStatus as baseUsersByStatus,
  playerAcquisition as basePlayerAcquisition,
  revenueMetricsTrend as baseRevenueMetricsTrend,
  segmentDistribution as baseSegmentDistribution,
  depositWithdrawalFlow as baseDepositWithdrawalFlow,
  conversionRateTrend as baseConversionRateTrend,
  summaryMetrics as baseSummaryMetrics,
  transactionSummary as baseTransactionSummary,
  geographicDistribution as baseGeographicDistribution,
  trendBySegment as baseTrendBySegment,
  dailyTrendWithMA as baseDailyTrendWithMA,
  detailedBreakdown as baseDetailedBreakdown,
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

const HERO_BG = "https://private-us-east-1.manuscdn.com/sessionFile/cKq6wfrB6w3tj51hFB9kbf/sandbox/bUQudPFuU0QLod3pzEsnEY-img-2_1771727908000_na1fn_cGxheWFiZXRzLWhlcm8tYmFubmVy.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvY0txNndmckI2dzN0ajUxaEZCOWtiZi9zYW5kYm94L2JVUXVkUEZ1VTBRTG9kM3B6RXNuRVktaW1nLTJfMTc3MTcyNzkwODAwMF9uYTFmbl9jR3hoZVdGaVpYUnpMV2hsY204dFltRnVibVZ5LnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=LHsnks1NO7SQ87OPqfr8X3UCWGKR~-4dFr0yVglkj0GAbZntP4Bq2VV88L-8FWkj-8edRLrlOJK73a4zD7Y7gnEAI9d6hcIeI7KCSJrwwvRW6UB4wYIBKcBGFFUxVdkuimzCKyEvj9PaaWLFw9ouP3Vbvp~P0BXrFkfjceNgumru40JCmdXs7tF5ZUtwpNldD~AWzgTIY-AdzkE4FML0W4RYJRXT7w~1Qnz5onsasdZIf27SUcyL1J0I-hug5HoXudlGMHMVhXBfL68bTeaaUTETPQLgYKwGeKSdDqRDAWfCqjgqLVzCnAKBODZh2PIZGvl4Na8qo18vldMjr9oPZg__";

const CHART_COLORS = {
  gold:  "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal:  "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
  red:   "oklch(0.55 0.22 25)",
};

const CARD_BG: React.CSSProperties = {
  background: "oklch(0.19 0.04 155)",
  border: "1px solid oklch(1 0 0 / 6%)",
};
const FONT_SERIF: React.CSSProperties = {};
const FONT_MONO: React.CSSProperties  = {};

const TT_STYLE: React.CSSProperties = {
  background: "oklch(0.22 0.04 155)",
  border: "1px solid oklch(1 0 0 / 10%)",
  fontSize: 11,
};

const COUNTRY_BRAND_MAP: Record<string, string> = {
  Nigeria: "PlayaBets NG",
  Ghana: "PlayaBets GH",
  Kenya: "PlayaBets KE",
  Uganda: "PlayaBets UG",
  Zambia: "PlayaBets ZM",
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");

type DataMode = "mock" | "partial" | "live";

async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

function toIsoDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseSeriesDate(value: string | undefined, fallbackYear: number): Date | null {
  if (!value) {
    return null;
  }
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dt = new Date(`${raw}T00:00:00Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (/^\d{4}-\d{2}-\d{2}\s/.test(raw)) {
    const dt = new Date(raw.replace(" ", "T"));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (/^[A-Za-z]{3}$/.test(raw)) {
    const dt = new Date(`${raw} 1, ${fallbackYear} UTC`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) {
      const normalized = value.replace(/\//g, "-");
      const dt = new Date(`${normalized}T00:00:00Z`);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  }
  const dt = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function monthKey(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function filterMonthRows<T>(
  rows: T[],
  filters: DashboardFilters,
  getMonthValue: (row: T) => string | undefined,
  fallbackYear: number,
): T[] {
  const from = parseIsoDate(filters.dateFrom);
  const to = parseIsoDate(filters.dateTo);
  if (!from || !to) {
    return rows;
  }
  const min = Math.min(monthKey(from), monthKey(to));
  const max = Math.max(monthKey(from), monthKey(to));
  const monthOnly = rows.every((row) => /^[A-Za-z]{3}$/.test((getMonthValue(row) ?? "").trim()));
  if (!monthOnly) {
    return rows.filter((row) => {
      const dt = parseSeriesDate(getMonthValue(row), fallbackYear);
      if (!dt) {
        return true;
      }
      const mk = monthKey(dt);
      return mk >= min && mk <= max;
    });
  }

  const monthIndex = (value: string): number =>
    new Date(`${value} 1, 2000 UTC`).getUTCMonth();

  const resolved: number[] = new Array(rows.length).fill(fallbackYear);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (i === rows.length - 1) {
      resolved[i] = fallbackYear;
    } else {
      const current = monthIndex(String(getMonthValue(rows[i]) ?? "Jan"));
      const next = monthIndex(String(getMonthValue(rows[i + 1]) ?? "Jan"));
      resolved[i] = current > next ? resolved[i + 1] - 1 : resolved[i + 1];
    }
  }

  return rows.filter((row, idx) => {
    const m = String(getMonthValue(row) ?? "").trim();
    const dt = parseSeriesDate(m, resolved[idx]);
    if (!dt) {
      return true;
    }
    const mk = monthKey(dt);
    return mk >= min && mk <= max;
  });
}

function bucketStart(date: Date, granularity: DashboardFilters["granularity"]): Date {
  const out = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === "monthly") {
    return new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth(), 1));
  }
  if (granularity === "weekly") {
    const day = out.getUTCDay();
    const mondayOffset = (day + 6) % 7;
    out.setUTCDate(out.getUTCDate() - mondayOffset);
  }
  return out;
}

function aggregateByGranularity<T extends Record<string, unknown>>(
  rows: T[],
  granularity: DashboardFilters["granularity"],
  getDate: (row: T) => string | undefined,
  options?: {
    fallbackYear?: number;
    labelKey?: string;
    avgFields?: string[];
  },
): T[] {
  if (granularity === "daily") {
    return rows;
  }

  const labelKey = options?.labelKey ?? "date";
  const avgFields = new Set(options?.avgFields ?? []);
  const fallbackYear = options?.fallbackYear ?? new Date().getFullYear();

  const grouped = new Map<string, { sample: T; sums: Record<string, number>; counts: Record<string, number> }>();

  rows.forEach((row) => {
    const date = parseSeriesDate(getDate(row), fallbackYear);
    if (!date) {
      return;
    }
    const key = toIsoDate(bucketStart(date, granularity));
    const entry =
      grouped.get(key) ??
      {
        sample: row,
        sums: {},
        counts: {},
      };

    Object.entries(row).forEach(([field, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        entry.sums[field] = (entry.sums[field] ?? 0) + value;
        entry.counts[field] = (entry.counts[field] ?? 0) + 1;
      }
    });

    grouped.set(key, entry);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => {
      const out: Record<string, unknown> = { ...entry.sample, [labelKey]: key };
      Object.entries(out).forEach(([field, value]) => {
        if (typeof value === "number" && Number.isFinite(value) && entry.sums[field] !== undefined) {
          const summed = entry.sums[field];
          if (avgFields.has(field)) {
            const avg = summed / Math.max(1, entry.counts[field] ?? 1);
            out[field] = Number(avg.toFixed(1));
          } else {
            out[field] = Number.isInteger(value) ? Math.round(summed) : Number(summed.toFixed(2));
          }
        }
      });
      return out as T;
    });
}

function toggleBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? "oklch(0.72 0.14 85)" : "oklch(0.24 0.04 155)",
    color: active ? "oklch(0.12 0.04 155)" : "oklch(0.55 0.01 155)",
    border: "1px solid oklch(1 0 0 / 8%)",
    fontWeight: active ? 700 : 500,
    transition: "all 0.15s",
    cursor: "pointer",
    padding: "3px 10px",
    borderRadius: "4px",
    fontSize: "11px",
  };
}

type MetricRow = {
  metric: string;
  current: number;
  previous: number;
  ytd: number;
  isPercent?: boolean;
  isCurrency?: boolean;
};

function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return parseFloat(((current - previous) / previous * 100).toFixed(1));
}

function fmtMetric(val: number, row: MetricRow): string {
  if (row.isPercent)  return `${val.toFixed(1)}%`;
  if (row.isCurrency) return `${formatCompact(val)}`;
  return formatCompact(val);
}

export default function Home() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [revMetric, setRevMetric] = useState<"ggr" | "ngr" | "turnover">("ggr");
  const [acqMode,   setAcqMode]   = useState<"trend" | "mom">("trend");
    const [summaryTab, setSummaryTab] = useState<"overview" | "sport" | "casino" | "all">("overview");
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
  // segmentPending must be declared AFTER hasSegmentData to avoid TDZ error
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

      const [
        kpisRes,
        dailyRes,
        casinoDailyRes,
        bonusDailyRes,
        regsRes,
        txRes,
        betslipStatusRes,
        userStatusRes,
        rfmSegmentsRes,
      ] = await Promise.allSettled([
        fetchJson<{
          registrations?: number;
          actives?: number;
          turnover?: number;
          winnings?: number;
          ggr?: number;
          ngr?: number;
          deposits?: number;
          withdrawals?: number;
          bonus_spent?: number;
          ftds?: number;
        }>(`/kpis?${query}`),
        fetchJson<{
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
        fetchJson<{ points: Array<{ date: string; stake?: number; winnings?: number; ggr?: number }> }>(
          `/casino/daily?${query}`
        ),
        fetchJson<{ points: Array<{ date: string; bonus_credited?: number }> }>(`/bonus/daily?${query}`),
        fetchJson<{ registrations: Array<{ date: string; value: number }>; ftds: Array<{ date: string; value: number }> }>(
          `/timeseries/registrations?${regsQuery}`
        ),
        fetchJson<{
          has_data?: boolean;
          deposits?: number;
          withdrawals?: number;
          tx_count_pending?: number;
          tx_count_accepted?: number;
          tx_count_other_status?: number;
        }>(`/transactions/kpis?${query}`),
        fetchJson<Array<{ status?: string; statusId?: number | null; count?: number }>>(
          `/betting/betslips-by-status?${query}`
        ),
        fetchJson<{ statuses: Array<{ status?: string; count?: number }> }>(
          `/users/status-breakdown?${query}`
        ),
        fetchJson<{ rows: Array<{ date: string; rfm_champions?: number; rfm_loyal?: number; rfm_big_spenders?: number; rfm_mid?: number; rfm_at_risk?: number; rfm_dormant?: number }> }>(
          `/rfm/segments?start=${filters.dateFrom}&end=${filters.dateTo}`
        ),
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
        rfm_at_risk:     "oklch(0.65 0.15 30)",   // orange — At Risk
        rfm_dormant:     "oklch(0.45 0.05 0)",    // muted red — Dormant
      };
      const SEGMENT_LABELS: Record<string, string> = {
        rfm_champions:   "Champions",
        rfm_loyal:       "Loyal",
        rfm_big_spenders:"Big Spenders",
        rfm_mid:         "Mid",
        rfm_at_risk:     "At Risk",
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
        setLiveRangeKpis({
          registrations: Number(k.registrations ?? 0),
          ftds: Number(k.ftds ?? 0),
        });
        setLiveNgr(Number(k.ngr ?? 0));
        setLiveOverviewKPIs({
          ...baseOverviewKPIs,
          activeUsers: Number(k.actives ?? 0),
          totalBetslips,
          totalStake: Number(k.turnover ?? 0),
          totalWinnings: Number(k.winnings ?? Number(k.turnover ?? 0) - Number(k.ggr ?? 0)),
          grossRevenue: Number(k.ggr ?? 0),
        });
      } else {
        setLiveNgr(null);
        setLiveBonusCoverage(null);
      }

      if (txRes.status === "fulfilled") {
        const tx = txRes.value;
        setHasTransactionsData(Boolean(tx.has_data));
        setLiveTransactionSummary({
          ...baseTransactionSummary,
          totalDeposits: Number(tx.deposits ?? 0),
          totalWithdrawals: Number(tx.withdrawals ?? 0),
          pendingTransactions: Number(tx.tx_count_pending ?? 0),
          acceptedToday: Number(tx.tx_count_accepted ?? 0),
          refusedToday: Number(tx.tx_count_other_status ?? 0),
        });
      } else {
        setHasTransactionsData(false);
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
      matchesRowFilters(filters, { segment: row.segment }),
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
  const depositWithdrawalFlow = useMemo(
    () => scaleArrayNumericFields(
      filterMonthRows(baseDepositWithdrawalFlow, filters, (row) => row.month, fallbackYear),
      multiplier,
      ["month"],
    ),
    [filters, fallbackYear, multiplier],
  );
  const conversionRateTrend = useMemo(() => {
    const filtered = filterByDateRange(sourceConversionRateTrend, filters, (row) => row.date);
    const normalized = filtered.map((row) => {
      const cast = row as { rate?: number; rate7d?: number; rate30d?: number };
      if (cast.rate7d === undefined && cast.rate30d === undefined && typeof cast.rate === "number") {
        return { ...row, rate7d: cast.rate, rate30d: cast.rate };
      }
      return row;
    });
    const scaled = scaleArrayNumericFields(
      normalized,
      multiplier,
      ["date"],
    );
    return aggregateByGranularity(scaled, filters.granularity, (row) => row.date, {
      labelKey: "date",
      fallbackYear,
      avgFields: ["rate7d", "rate30d"],
    });
  }, [fallbackYear, filters, multiplier, sourceConversionRateTrend]);
  const summaryMetrics = useMemo(() => {
    const scaleMetricRows = (rows: typeof baseSummaryMetrics.overview) =>
      rows.map((row) => ({
        ...row,
        current: scaleNumber(row.current, multiplier),
        previous: scaleNumber(row.previous, multiplier),
        ytd: scaleNumber(row.ytd, multiplier),
      }));
    return {
      overview: scaleMetricRows(baseSummaryMetrics.overview),
      sportDetails: scaleMetricRows(baseSummaryMetrics.sportDetails),
      casinoDetails: scaleMetricRows(baseSummaryMetrics.casinoDetails),
    };
  }, [multiplier]);
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
    const monthFiltered = filterMonthRows(baseTrendBySegment, filters, (row) => row.month, fallbackYear);
    const scaled = scaleArrayNumericFields(monthFiltered, multiplier, ["month"]);
    return scaled.map((row) => {
      const out = { ...row };
      const segmentFilters = [filters.currentSegment].filter((value) => value !== "all");
      if (segmentFilters.length > 0) {
        (["VIP", "PVIP", "Mass", "Mix"] as const).forEach((segment) => {
          if (!segmentFilters.some((value) => value.toUpperCase() === segment)) {
            out[segment] = 0;
          }
        });
      }
      return out;
    });
  }, [fallbackYear, filters, multiplier]);
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

  const fromDt = parseIsoDate(filters.dateFrom);
  const toDt = parseIsoDate(filters.dateTo);
  const skipFirstMoM = Boolean(fromDt && fromDt.getUTCDate() !== 1);
  const skipLastMoM = (() => {
    if (!toDt) return false;
    const end = new Date(Date.UTC(toDt.getUTCFullYear(), toDt.getUTCMonth() + 1, 0));
    return toDt.getUTCDate() !== end.getUTCDate();
  })();
  const momData = playerAcquisition.slice(1).map((d, i) => {
    if (skipFirstMoM && i === 0) {
      return { month: d.month, registrations: null, ftds: null };
    }
    if (skipLastMoM && i === playerAcquisition.length - 2) {
      return { month: d.month, registrations: null, ftds: null };
    }
    const prev = playerAcquisition[i];
    const prevRegs = prev.registrations;
    const prevFtds = prev.ftds;
    const registrationsChange = prevRegs > 0
      ? parseFloat((((d.registrations - prevRegs) / prevRegs) * 100).toFixed(1))
      : null;
    const ftdsChange = prevFtds > 0
      ? parseFloat((((d.ftds - prevFtds) / prevFtds) * 100).toFixed(1))
      : null;
    return {
      month: d.month,
      registrations: registrationsChange,
      ftds: ftdsChange,
    };
  });

  const getSummaryRows = (): MetricRow[] => {
    if (summaryTab === "overview") return summaryMetrics.overview;
    if (summaryTab === "sport")    return summaryMetrics.sportDetails;
    if (summaryTab === "casino")   return summaryMetrics.casinoDetails;
    return [...summaryMetrics.overview, ...summaryMetrics.sportDetails, ...summaryMetrics.casinoDetails];
  };

  const renderSummaryMetricsTable = () => (
    <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Summary Metrics</h3>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Mock Data - TBC</span>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
          style={{ background: CHART_COLORS.green, color: "white" }}
          onClick={() => {
            const rows = getSummaryRows();
            const csv = ["Metric,Current Period,Previous Period,Change %,YTD",
              ...rows.map((r) => `${r.metric},${fmtMetric(r.current, r)},${fmtMetric(r.previous, r)},${pctChange(r.current, r.previous)}%,${fmtMetric(r.ytd, r)}`)
            ].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `playabets_summary_${summaryTab}_${filters.dateFrom}_${filters.dateTo}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={12} />
          Export to Excel
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "oklch(1 0 0 / 8%)" }}>
        {([
          { key: "overview", label: "Overview" },
          { key: "sport",    label: "Sport Details" },
          { key: "casino",   label: "Casino Details" },
          { key: "all",      label: "All Metrics" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSummaryTab(key)}
            className="px-4 py-2 text-xs font-semibold transition-colors relative"
            style={{
              color: summaryTab === key ? CHART_COLORS.gold : "oklch(0.55 0.01 155)",
              borderBottom: summaryTab === key ? `2px solid ${CHART_COLORS.gold}` : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
              {["Metric", "Current Period", "Previous Period", "Change %", "YTD"].map((h) => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider pb-2 pr-4 whitespace-nowrap" style={{ color: "oklch(0.45 0.01 155)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {getSummaryRows().map((row) => {
              const chg = pctChange(row.current, row.previous);
              return (
                <tr key={row.metric} className="hover:bg-white/2 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-4 text-white/80 text-xs font-medium">{row.metric}</td>
                  <td className="py-2.5 pr-4 text-white text-xs font-mono"   style={FONT_MONO}>{fmtMetric(row.current,  row)}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono" style={FONT_MONO}>{fmtMetric(row.previous, row)}</td>
                  <td className="py-2.5 pr-4 text-xs font-semibold font-mono" style={{ ...FONT_MONO, color: chg >= 0 ? CHART_COLORS.green : CHART_COLORS.red }}>
                    {chg >= 0 ? "+" : ""}{chg}%
                  </td>
                  <td className="py-2.5 text-white/60 text-xs font-mono" style={FONT_MONO}>{fmtMetric(row.ytd, row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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

      {/* ── PRIMARY KPIs — ROW 1 ────────────────────────────────────────── */}
      <div className="mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: CHART_COLORS.gold }}>
          Primary KPIs
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-3 mb-3">
        <KpiCard title="Registrations" value={formatCompact(kpiRegistrations)} subtitle="Selected range"
          icon={<UserPlus size={18} />} accent="teal" loading={isLoading} />
        <KpiCard title="FTDs" value={formatCompact(kpiFtds)} subtitle="First-time depositors"
          icon={<Users size={18} />} accent="gold" loading={isLoading} />
        <KpiCard title="Actives" value={formatCompact(overviewKPIs.activeUsers)} subtitle="Sports + Casino actives"
          icon={<Activity size={18} />} accent="green" loading={isLoading} />
        <KpiCard
          title="Total Deposits"
          value={hasTransactionsData ? `${formatCompact(transactionSummary.totalDeposits)}` : "Pending"}
          subtitle={hasTransactionsData ? "Gross deposits" : "Transactions export pending"}
          icon={<DollarSign size={18} />}
          accent="amber"
          loading={isLoading}
        />
      </div>

      {/* ── PRIMARY KPIs — ROW 2 ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <KpiCard
          title="Total Withdrawals"
          value={hasTransactionsData ? `${formatCompact(transactionSummary.totalWithdrawals)}` : "Pending"}
          subtitle={hasTransactionsData ? "Paid out" : "Transactions export pending"}
          icon={<ArrowUpRight size={18} />}
          accent="red"
          loading={isLoading}
        />
        <KpiCard title="Total Turnover" value={`${formatCompact(overviewKPIs.totalStake)}`} subtitle="Sports + Casino"
          icon={<TrendingUp size={18} />} accent="teal" loading={isLoading} />
        <KpiCard title="GGR" value={`${formatCompact(overviewKPIs.grossRevenue)}`} subtitle={`Sports + Casino · ${margin}% margin`}
          icon={<BarChart2 size={18} />} accent="gold" loading={isLoading} />
      </div>

      {/* ── PRIMARY KPIs — ROW 3 ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard title="NGR" value={ngrCardValue} subtitle={ngrCardSubtitle}
          icon={<Percent size={18} />} accent="green" loading={isLoading} />
        <KpiCard
          title="Top_FTDs (TBC from RFM)"
          value="TBC"
          valueClassName="text-white/35"
          subtitle="High-value FTDs"
          icon={<Zap size={18} />}
          accent="gold"
          loading={isLoading}
        />
        <KpiCard title="Conversion Rate" value={`${periodConvRate}%`} subtitle="Reg → FTD"
          icon={<Percent size={18} />} accent="amber" loading={isLoading} />
      </div>

      {/* ── REVENUE TRENDS — GGR/NGR/TURNOVER TOGGLE ────────────────────── */}
      <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Revenue Trends — Daily View</h3>
            <p className="text-xs text-white/40">{granularityLabel} GGR / NGR / Turnover — selected period</p>
          </div>
          <div className="flex gap-1">
            {(["ggr", "ngr", "turnover"] as const).map((m) => (
              <button key={m} style={toggleBtn(revMetric === m)} onClick={() => setRevMetric(m)}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={revenueMetricsTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={revMetric === "ggr" ? CHART_COLORS.gold : revMetric === "ngr" ? CHART_COLORS.green : CHART_COLORS.teal} stopOpacity={0.3} />
                <stop offset="95%" stopColor={revMetric === "ggr" ? CHART_COLORS.gold : revMetric === "ngr" ? CHART_COLORS.green : CHART_COLORS.teal} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
            <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => [`${formatCompact(v)}`, revMetric.toUpperCase()]} />
            <Area type="monotone" dataKey={revMetric} name={revMetric.toUpperCase()}
              stroke={revMetric === "ggr" ? CHART_COLORS.gold : revMetric === "ngr" ? CHART_COLORS.green : CHART_COLORS.teal}
              fill="url(#revGrad)" strokeWidth={2} dot={false} />
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
            <div className="flex gap-1">
              {(["trend", "mom"] as const).map((m) => (
                <button key={m} style={toggleBtn(acqMode === m)} onClick={() => setAcqMode(m)}>
                  {m === "trend" ? "Total" : "MoM %"}
                </button>
              ))}
            </div>
          </div>
          {playerAcquisition.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              {acqMode === "trend" ? (
                <BarChart data={playerAcquisition} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={45} />
                  <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatCompact(v)} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
                  <Bar dataKey="registrations" name="Registrations" fill={CHART_COLORS.teal}  radius={[2, 2, 0, 0]} />
                  <Bar dataKey="ftds"          name="FTDs"          fill={CHART_COLORS.gold}  radius={[2, 2, 0, 0]} />
                </BarChart>
              ) : (
                <BarChart data={momData} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={TT_STYLE} formatter={(v: number | null) => (v == null ? "n/a" : `${v}%`)} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
                  <Bar dataKey="registrations" name="Regs MoM%"  fill={CHART_COLORS.teal} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="ftds"          name="FTDs MoM%"  fill={CHART_COLORS.gold} radius={[2, 2, 0, 0]} />
                </BarChart>
              )}
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
                formatter={(v: number | null) => (v == null ? "n/a" : `${v}%`)}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
              <Line type="monotone" dataKey="rate7d"  name="7d Conversion"  stroke={CHART_COLORS.amber} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="rate30d" name="30d Conversion" stroke={CHART_COLORS.teal}  strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── SEGMENT DISTRIBUTION + DEPOSIT VS WITHDRAWAL ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Segment Distribution */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={true} label="RFM Pending" description="TBC — RFM Segments" />
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Segment Distribution — Actives</h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">TBC — RFM Segments</p>
            <p className="text-xs text-white/40">RFM analysis will categorise players into: Champions · Loyal · Big Spenders · Mid · At Risk · Dormant</p>
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

        {/* Deposit vs Withdrawal Flow */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={depositFlowPending} description="Mock data - pending transactions flow" />
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Deposit vs Withdrawal Flow</h3>
            <p className="text-xs text-white/40">Net cash flow by month</p>
          </div>
          {depositWithdrawalFlow.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={depositWithdrawalFlow} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => `${formatCompact(v)}`} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
                <Bar dataKey="deposits"    name="Deposits"    fill={CHART_COLORS.green} radius={[2, 2, 0, 0]} />
                <Bar dataKey="withdrawals" name="Withdrawals" fill={CHART_COLORS.red}   radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center text-xs text-white/50">
              No deposit/withdrawal rows for current date range.
            </div>
          )}
        </div>
      </div>

      {/* ── SEGMENT PERFORMANCE KPI ROW ─────────────────────────────────── */}
      <div className="relative rounded-xl p-5 mb-4" style={CARD_BG}>
        <MockOverlay active={true} label="RFM Pending" description="TBC — RFM Segments" />
        <h3 className="text-sm font-semibold text-white mb-4" style={FONT_SERIF}>Segment Performance</h3>
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-4">TBC — RFM Segments: Champions · Loyal · Big Spenders · Mid · At Risk · Dormant</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {segmentDistribution.map((s) => (
            <div key={s.segment} className="text-center p-3 rounded-lg" style={{ background: "oklch(0.16 0.04 155)" }}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: s.color }}>{s.segment}</div>
              <div className="text-xl font-bold text-white mb-0.5" style={FONT_MONO}>{formatCompact(s.count)}</div>
              <div className="text-xs text-white/40">{s.pct}% of Total</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SUMMARY METRICS TABLE ────────────────────────────────────────── */}
      {/* Summary Metrics */}

      {/* ── GEOGRAPHIC DISTRIBUTION ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 mb-4">
        {/* Geographic Distribution */}
          <div className="relative rounded-xl p-5" style={CARD_BG}>
            <MockOverlay active={geoPending} description="Mock data - geographic pending" />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Geographic Distribution</h3>
              <p className="text-xs text-white/40">Players & GGR by Territory / Country</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: CHART_COLORS.teal }}>Mock</span>
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.72 0.17 60 / 15%)", color: CHART_COLORS.amber }}>Brand split mapped</span>
            </div>
          </div>
          {geographicDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={geographicDistribution} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={40} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={55} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number, name: string) => name === "GGR" ? `${formatCompact(v)}` : formatCompact(v)} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
                <Bar yAxisId="left"  dataKey="players" name="Players" fill={CHART_COLORS.teal}  radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="ggr"     name="GGR"     fill={CHART_COLORS.gold}  radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center text-xs text-white/50">
              No geographic rows for current filter combination.
            </div>
          )}
        </div>
      </div>

      {/* ── TREND BY SEGMENT + DAILY TREND ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Trend by Segment */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={true} label="RFM Pending" description="TBC — RFM Segments" />
          <div className="mb-4 flex items-center justify-between">
            <div>
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Trend by Segment</h3>
            <p className="text-xs text-white/40">{granularityLabel} GGR by segment — Champions · Loyal · Big Spenders · Mid · At Risk · Dormant</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: CHART_COLORS.teal }}>
              Segment filters applied
            </span>
          </div>
          {trendBySegment.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendBySegment} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={55} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => `${formatCompact(v)}`} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
                <Bar dataKey="VIP"  fill={CHART_COLORS.gold}  stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="PVIP" fill={CHART_COLORS.teal}  stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="Mass" fill={CHART_COLORS.green} stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="Mix"  fill={CHART_COLORS.amber} stackId="a" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] rounded-lg border border-white/10 bg-white/[0.02] flex items-center justify-center text-xs text-white/50">
              No segment-trend rows for current date range.
            </div>
          )}
        </div>

        {/* Daily Trend with 7-day Moving Average */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={showPendingOverlay} description="Daily trend pending live data" />
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Daily Trend</h3>
              <p className="text-xs text-white/40">GGR with 7-day moving average</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: CHART_COLORS.teal }}>7-day MA</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyTrendWithMA} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => `${formatCompact(v)}`} />
              <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.01 0)" }} />
              <Line type="monotone" dataKey="value" name="Daily GGR" stroke={CHART_COLORS.gold}  strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
              <Line type="monotone" dataKey="ma7"   name="7-day MA"  stroke={CHART_COLORS.teal}  strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── ORIGINAL CHARTS ─────────────────────────────────────────────── */}
      {/* Stake vs Revenue */}
      <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Stake vs Revenue</h3>
            <p className="text-xs text-white/40">Same GGR basis as Revenue Trends chart</p>
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
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS.green} fill="url(#revenueGrad)" strokeWidth={2}   dot={false} />
            </AreaChart>
          </ResponsiveContainer>
      </div>

      {/* Betslip Status + User Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Betslip Status pie */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={betslipStatusPending} description="Betslip status pending live data" />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Betslip Status</h3>
              <p className="text-xs text-white/40">Distribution by status</p>
            </div>
            {betslipStatusPending ? (
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: CHART_COLORS.teal }}>
                Mock
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.62 0.17 145 / 15%)", color: CHART_COLORS.green }}>
                Live
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={betslipsByStatus} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="count" nameKey="status" paddingAngle={2}>
                {betslipsByStatus.map((_, i) => (
                  <Cell key={i} fill={[CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.amber, CHART_COLORS.teal, "#6b7280"][i % 5]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatCompact(v)} contentStyle={TT_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {betslipsByStatus.map((s, i) => (
              <div key={s.status} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: [CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.amber, CHART_COLORS.teal, "#6b7280"][i % 5] }} />
                  <span className="text-white/60 truncate max-w-[110px]">{s.status}</span>
                </div>
                <span className="text-white/70 font-mono text-xs" style={FONT_MONO}>{formatCompact(s.count)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* User Status pie */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={userStatusPending} description="User status pending live data" />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>User Status</h3>
              <p className="text-xs text-white/40">Distribution by status</p>
            </div>
            {userStatusPending ? (
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: CHART_COLORS.teal }}>
                Mock
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.62 0.17 145 / 15%)", color: CHART_COLORS.green }}>
                Live
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={usersByStatus} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="count" nameKey="status" paddingAngle={2}>
                {usersByStatus.map((_, i) => (
                  <Cell key={i} fill={[CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.amber, CHART_COLORS.teal, "#6b7280"][i % 5]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatCompact(v)} contentStyle={TT_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {usersByStatus.map((u, i) => (
              <div key={u.status} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: [CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.amber, CHART_COLORS.teal, "#6b7280"][i % 5] }} />
                  <span className="text-white/60 truncate max-w-[110px]">{u.status}</span>
                </div>
                <span className="text-white/70 font-mono text-xs" style={FONT_MONO}>{formatCompact(u.count)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {renderSummaryMetricsTable()}

      {/* ── DETAILED BREAKDOWN TABLE ─────────────────────────────────────── */}
      <div className="rounded-xl p-5" style={CARD_BG}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white" style={FONT_SERIF}>Detailed Breakdown</h3>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Mock Data - TBC</span>
            </div>
            <p className="text-xs text-white/40">Date · Brand · Segment · Territory · Value · % Change</p>
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
            style={{ background: CHART_COLORS.teal, color: "white" }}
            onClick={() => {
              const csv = ["Date,Brand,Segment,Territory,Value,% Change",
                ...detailedBreakdown.map((r) =>
                  `${r.date},${r.brand},${r.segment},${r.territory},${formatCompact(r.value)},${r.pctChange >= 0 ? "+" : ""}${r.pctChange}%`
                )
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `playabets_detailed_breakdown_${filters.dateFrom}_${filters.dateTo}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download size={12} />
            Export to Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Date", "Brand", "Segment", "Territory", "Value", "% Change"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider pb-2 pr-6 whitespace-nowrap" style={{ color: "oklch(0.45 0.01 155)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detailedBreakdown.map((row, idx) => (
                <tr key={idx} className="hover:bg-white/2 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-6 text-white/50 text-xs font-mono" style={FONT_MONO}>{row.date}</td>
                  <td className="py-2.5 pr-6 text-white/80 text-xs font-medium">{row.brand}</td>
                  <td className="py-2.5 pr-6">
                    <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{
                      background: row.segment === "VIP" ? "oklch(0.72 0.14 85 / 15%)" : row.segment === "PVIP" ? "oklch(0.65 0.15 195 / 15%)" : row.segment === "Mass" ? "oklch(0.62 0.17 145 / 15%)" : "oklch(0.72 0.17 60 / 15%)",
                      color: row.segment === "VIP" ? CHART_COLORS.gold : row.segment === "PVIP" ? CHART_COLORS.teal : row.segment === "Mass" ? CHART_COLORS.green : CHART_COLORS.amber,
                    }}>{row.segment}</span>
                  </td>
                  <td className="py-2.5 pr-6 text-white/60 text-xs">{row.territory}</td>
                  <td className="py-2.5 pr-6 text-white text-xs font-mono" style={FONT_MONO}>{ formatCompact(row.value)}</td>
                  <td className="py-2.5 text-xs font-semibold font-mono" style={{ ...FONT_MONO, color: row.pctChange >= 0 ? CHART_COLORS.green : CHART_COLORS.red }}>
                    {row.pctChange >= 0 ? "+" : ""}{row.pctChange}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
