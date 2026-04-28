import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { getLatestDataDate, setLatestDataDate as persistLatestDate, getLastUpdated, setLastUpdated } from "@/lib/apiCache";
import type { DashboardFilters } from "@/components/TopFiltersBar";
import type { MetricRow } from "./homeUtils";
import {
  overviewKPIs as baseOverviewKPIs,
  revenueTrend as baseRevenueTrend,
  betslipsByStatus as baseBetslipsByStatus,
  usersByStatus as baseUsersByStatus,
  playerAcquisition as basePlayerAcquisition,
  revenueMetricsTrend as baseRevenueMetricsTrend,
  segmentDistribution as baseSegmentDistribution,
  conversionRateTrend as baseConversionRateTrend,
  transactionSummary as baseTransactionSummary,
} from "@/lib/mockData";
import { fetchJson, type DataMode } from "./homeUtils";

type UseHomeDataArgs = {
  filters: DashboardFilters;
  setFilters: Dispatch<SetStateAction<DashboardFilters>>;
};

export function useHomeData({ filters, setFilters }: UseHomeDataArgs) {
  const [dataMode, setDataMode] = useState<DataMode>("mock");
  const [latestDataDate, setLatestDataDate] = useState<string | null>(getLatestDataDate());
  const [isLoading, setIsLoading] = useState<boolean>(getLatestDataDate() === null);

  const [liveOverviewKPIs, setLiveOverviewKPIs] = useState<typeof baseOverviewKPIs | null>(null);
  const [liveRevenueTrend, setLiveRevenueTrend] = useState<typeof baseRevenueTrend | null>(null);
  const [liveRevenueMetricsTrend, setLiveRevenueMetricsTrend] = useState<typeof baseRevenueMetricsTrend | null>(null);
  const [livePlayerAcquisition, setLivePlayerAcquisition] = useState<typeof basePlayerAcquisition | null>(null);
  const [liveConversionRateTrend, setLiveConversionRateTrend] = useState<Array<{ date: string; rate7d: number | null; rate30d: number | null }> | null>(null);
  const [livePlayerAcquisitionDaily, setLivePlayerAcquisitionDaily] = useState<Array<{ date: string; registrations: number; ftds: number }> | null>(null);
  const [liveSportsCasinoGgr, setLiveSportsCasinoGgr] = useState<Array<{ date: string; sports_ggr: number; casino_ggr: number }> | null>(null);
  const [liveTransactionSummary, setLiveTransactionSummary] = useState<typeof baseTransactionSummary | null>(null);
  const [liveRangeKpis, setLiveRangeKpis] = useState<{ registrations: number; ftds: number } | null>(null);
  const [liveNgr, setLiveNgr] = useState<number | null>(null);
  const [liveBonusSpent, setLiveBonusSpent] = useState<number | null>(null);
  const [liveUniqueDepositors, setLiveUniqueDepositors] = useState<number | null>(null);
  const [liveBonusTxIssued, setLiveBonusTxIssued] = useState<number | null>(null);
  const [liveBonusConverted, setLiveBonusConverted] = useState<number | null>(null);
  const [liveBonusPct, setLiveBonusPct] = useState<number | null>(null);
  const [liveChurnPct, setLiveChurnPct] = useState<number | null>(null);
  const [liveFtdRegMonth, setLiveFtdRegMonth] = useState<number | null>(null);
  const [liveBonusCoverage, setLiveBonusCoverage] = useState<{ coveredDays: number; totalDays: number } | null>(null);
  const [liveBetslipsByStatus, setLiveBetslipsByStatus] = useState<Array<{ status: string; statusId: number | null; count: number }> | null>(null);
  const [liveUsersByStatus, setLiveUsersByStatus] = useState<Array<{ status: string; count: number }> | null>(null);
  const [liveSegmentTrend, setLiveSegmentTrend] = useState<Array<{
    date: string;
    VIP: number;
    Active: number;
    New: number;
    "Cooling": number;
    Lapsed: number;
    Dormant: number;
  }> | null>(null);
  const [liveTodayKpis, setLiveTodayKpis] = useState<{
    ggr: number;
    turnover: number;
    registrations: number;
    activeSports: number;
    activeCasino: number;
    ftds: number;
    deposits: number;
    withdrawals: number;
    bonusRedeemed: number;
    hasTransactionsToday: boolean;
  } | null>(null);
  const [hasTransactionsData, setHasTransactionsData] = useState<boolean>(false);
  const [hasBetslipStatusData, setHasBetslipStatusData] = useState<boolean>(false);
  const [hasUserStatusData, setHasUserStatusData] = useState<boolean>(false);
  const [liveSegmentDistribution, setLiveSegmentDistribution] = useState<typeof baseSegmentDistribution | null>(null);
  const [hasSegmentData, setHasSegmentData] = useState<boolean>(false);
  const [liveSummaryMetrics, setLiveSummaryMetrics] = useState<{
    overview: MetricRow[];
    sport: MetricRow[];
    casino: MetricRow[];
    playerHealth: MetricRow[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJson<{ date?: string; last_updated?: string }>("/kpis/latest")
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
        if (latest.last_updated) setLastUpdated(latest.last_updated);
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
  }, [setFilters]);

  useEffect(() => {
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
      if (filters.currentSegment !== "all") params.set("current_segment", filters.currentSegment);
      if (filters.granularity) params.set("granularity", filters.granularity);
      const query = params.toString();

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
      if (filters.territory !== "all") regsParams.set("territory", filters.territory);
      if (filters.country !== "all") regsParams.set("country", filters.country);
      if (filters.currentSegment !== "all") regsParams.set("current_segment", filters.currentSegment);
      const regsQuery = regsParams.toString();

      const requests = {
        kpis: fetchJson<{
          registrations?: number;
          actives_sports?: number;
          actives_casino?: number;
          sports_actives?: number;
          casino_actives?: number;
          turnover?: number;
          winnings?: number;
          ggr?: number;
          ngr?: number;
          deposits?: number;
          withdrawals?: number;
          bonus_spent?: number;
          ftds?: number;
          ftd_reg_month?: number;
          has_transactions_data?: boolean;
          tx_count_pending?: number;
          tx_count_accepted?: number;
          tx_count_other_status?: number;
          unique_depositors?: number;
          bonus_redeemed?: number;
          bonus_tx_issued?: number;
          bonus_tx_net?: number;
          bonus_pct?: number;
          churn_pct?: number;
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
        }>(`/kpis/daily?${query}&metrics=placed_stake,settled_stake,settled_winnings,ggr,betslips_count`),
        casinoDaily: fetchJson<{ points: Array<{ date: string; stake?: number; winnings?: number; ggr?: number }> }>(`/casino/daily?${query}`),
        bonusDaily: fetchJson<{ points: Array<{ date: string; bonus_credited?: number }> }>(`/bonus/daily?${query}`),
        registrations: fetchJson<{ registrations: Array<{ date: string; value: number }>; ftds: Array<{ date: string; value: number }> }>(
          `/timeseries/registrations?${regsQuery}`
        ),
        conversionCohorts: fetchJson<{
          points: Array<{
            date: string;
            registrations?: number;
            ftds_d7?: number;
            ftds_d30?: number;
            rate_d7?: number | null;
            rate_d30?: number | null;
          }>;
        }>(`/timeseries/conversion-cohorts?start=${filters.dateFrom}&end=${filters.dateTo}`),
        ftdDaily: fetchJson<{ points: Array<{ date: string; ftds?: number }> }>(
          `/ftd/daily?start=${filters.dateFrom}&end=${filters.dateTo}`
        ),
        ftdRegMonthDaily: fetchJson<{ points: Array<{ date: string; ftd_reg_month?: number }> }>(
          `/ftd-reg-month/daily?start=${filters.dateFrom}&end=${filters.dateTo}`
        ),
        betslipStatus: fetchJson<Array<{ status?: string; statusId?: number | null; count?: number }>>(`/betting/betslips-by-status?${query}`),
        userStatus: fetchJson<{ statuses: Array<{ status?: string; count?: number }> }>(`/users/status-breakdown?${query}`),
        rfmSegments: fetchJson<{ rows: Array<{ date: string; rfm_vip?: number; rfm_active?: number; rfm_new?: number; rfm_cooling?: number; rfm_lapsed?: number; rfm_dormant?: number }> }>(
          `/rfm/segments?start=${filters.dateFrom}&end=${filters.dateTo}`
        ),
        summary: fetchJson<{
          current: Record<string, number>;
          previous: Record<string, number>;
          ytd: Record<string, number>;
          rfm: { vip: number; active: number; new: number; cooling: number; lapsed: number; dormant: number };
          self_exclusions: number;
        }>(`/kpis/summary?start=${filters.dateFrom}&end=${filters.dateTo}`),
      };

      const [kpisRes, dailyRes, casinoDailyRes, bonusDailyRes, regsRes, conversionCohortsRes, ftdDailyRes, ftdRegMonthDailyRes] = await Promise.allSettled([
        requests.kpis,
        requests.daily,
        requests.casinoDaily,
        requests.bonusDaily,
        requests.registrations,
        requests.conversionCohorts,
        requests.ftdDaily,
        requests.ftdRegMonthDaily,
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
        setLiveBonusSpent(k.bonus_spent != null ? Number(k.bonus_spent) : null);
        setLiveFtdRegMonth(k.ftd_reg_month != null ? Number(k.ftd_reg_month) : null);
        setLiveUniqueDepositors(k.unique_depositors != null ? Number(k.unique_depositors) : null);
        setLiveBonusTxIssued(k.bonus_tx_net != null && Number(k.bonus_tx_net) > 0 ? Number(k.bonus_tx_net) : null);
        setLiveBonusConverted(k.bonus_redeemed != null && Number(k.bonus_redeemed) > 0 ? Number(k.bonus_redeemed) : null);
        setLiveBonusPct(k.bonus_pct != null ? Number(k.bonus_pct) : null);
        setLiveChurnPct(k.churn_pct != null ? Number(k.churn_pct) : null);
        setLiveOverviewKPIs((prev) => ({
          ...baseOverviewKPIs,
          activesSports: Number(k.sports_actives ?? k.actives_sports ?? 0),
          activesCasino: Number(k.casino_actives ?? k.actives_casino ?? 0),
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
        setLiveBonusSpent(null);
        setLiveFtdRegMonth(null);
        setLiveUniqueDepositors(null);
        setLiveBonusTxIssued(null);
        setLiveBonusConverted(null);
        setLiveBonusPct(null);
        setLiveChurnPct(null);
        setLiveBonusCoverage(null);
        setHasTransactionsData(false);
        setLiveTransactionSummary(null);
      }

      const ftdByDateFull = new Map<string, number>();
      if (ftdDailyRes.status === "fulfilled") {
        for (const row of (ftdDailyRes.value?.points ?? [])) {
          ftdByDateFull.set(row.date, Number(row.ftds ?? 0));
        }
      }

      const ftdRegMonthByDate = new Map<string, number>();
      if (ftdRegMonthDailyRes.status === "fulfilled") {
        for (const row of (ftdRegMonthDailyRes.value?.points ?? [])) {
          ftdRegMonthByDate.set(row.date, Number(row.ftd_reg_month ?? 0));
        }
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
        const settledWinnings = Number(r.settled_winnings ?? (Number.isFinite(ggr) ? settledStake - ggr : 0));
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
          // Prefer bonus_total (credited + freebets issued); fall back to bonus_credited
          bonusByDate.set(p.date, Number((p as { bonus_total?: number; bonus_credited?: number }).bonus_total ?? p.bonus_credited ?? 0));
        }
      }

      const allDates = Array.from(
        new Set([
          ...Array.from(sportsbookByDate.keys()),
          ...Array.from(casinoByDate.keys()),
          ...Array.from(bonusByDate.keys()),
        ])
      ).sort();
      const fromDt = new Date(`${filters.dateFrom}T00:00:00Z`);
      const toDt = new Date(`${filters.dateTo}T00:00:00Z`);
      const totalDays = Number.isNaN(fromDt.getTime()) || Number.isNaN(toDt.getTime())
        ? Math.max(1, allDates.length)
        : Math.max(1, Math.floor(Math.abs(toDt.getTime() - fromDt.getTime()) / 86400000) + 1);
      setLiveBonusCoverage({
        coveredDays: bonusByDate.size,
        totalDays,
      });

      // Period-level NGR ratio from /kpis: distribute NGR across days proportional to GGR.
      // This avoids date-alignment issues between bonus InsertDate and betslip settlement dates
      // (bonus dates often don't match betslip dates, causing per-day deduction to miss).
      const periodGgr = kpisRes.status === "fulfilled" ? Number(kpisRes.value.ggr ?? 0) : 0;
      const periodNgr = kpisRes.status === "fulfilled" ? Number(kpisRes.value.ngr ?? null) : null;
      const ngrRatio = periodGgr > 0 && periodNgr != null ? periodNgr / periodGgr : null;

      const metrics = allDates.map((date) => {
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
        // Scale daily GGR by period NGR/GGR ratio → daily NGR sums to the correct period total
        const ngr = ngrRatio != null
          ? Number((ggr * ngrRatio).toFixed(2))
          : ggr - Number(bonusByDate.get(date) ?? 0);

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

      setLiveRevenueMetricsTrend(
        metrics.length > 0
          ? metrics.map((r) => ({
              date: r.date,
              turnover: r.turnover,
              ggr: r.ggr,
              ngr: r.ngr,
            }))
          : null
      );

      setLiveSportsCasinoGgr(
        allDates.length > 0
          ? allDates.map((date) => ({
              date,
              sports_ggr: sportsbookByDate.get(date)?.ggr ?? 0,
              casino_ggr: casinoByDate.get(date)?.ggr ?? 0,
            }))
          : null
      );

      setLiveRevenueTrend(
        metrics.length > 0
          ? metrics.map((r) => ({
              date: r.date,
              stake: r.turnover,
              winnings: r.winnings,
              revenue: r.ggr,
            }))
          : null
      );

      if (kpisRes.status === "fulfilled") {
        const k = kpisRes.value;
        const totalBetslips = Array.from(sportsbookByDate.values()).reduce((sum, r) => sum + r.betslipsCount, 0);
        setLiveOverviewKPIs({
          ...baseOverviewKPIs,
          activesSports: Number(k.sports_actives ?? k.actives_sports ?? 0),
          activesCasino: Number(k.casino_actives ?? k.actives_casino ?? 0),
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
          const regValue = Number(
            (row as { date: string; registrations?: number; value?: number; count?: number }).registrations
              ?? (row as { date: string; registrations?: number; value?: number; count?: number }).value
              ?? (row as { date: string; registrations?: number; value?: number; count?: number }).count
              ?? 0
          );
          regByDate.set(date, (regByDate.get(date) ?? 0) + regValue);
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

        // Daily player acquisition: registrations per day + FTD counts from ftdByDateFull
        const dailyAcq = Array.from(regByDate.entries())
          .filter(([date]) => date >= filters.dateFrom && date <= filters.dateTo)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, registrations]) => ({
            date,
            registrations,
            ftds: ftdByDateFull.get(date) ?? 0,
          }));
        setLivePlayerAcquisitionDaily(dailyAcq.length > 0 ? dailyAcq : null);

        // Conv rate trend: daily FTD Reg Month ÷ registrations
        const convDates = Array.from(
          new Set([...Array.from(regByDate.keys()), ...Array.from(ftdRegMonthByDate.keys())])
        ).filter((d) => d >= filters.dateFrom && d <= filters.dateTo).sort();
        const convRateRows = convDates
          .map((date) => {
            const regsCount = regByDate.get(date) ?? 0;
            const ftdRegCount = ftdRegMonthByDate.get(date) ?? 0;
            return {
              date,
              rate7d: regsCount > 0 ? Number(((ftdRegCount / regsCount) * 100).toFixed(1)) : null,
              rate30d: null as null,
            };
          })
          .filter((row) => row.rate7d !== null);
        setLiveConversionRateTrend(convRateRows.length > 0 ? convRateRows : null);
      } else {
        setLivePlayerAcquisitionDaily(null);
        setLiveConversionRateTrend(null);
      }

      // conversionCohortsRes is kept for potential future use but conv rate is now computed above
      void conversionCohortsRes;

      const [betslipStatusRes, userStatusRes, rfmSegmentsRes, summaryRes] = await Promise.allSettled([
        requests.betslipStatus,
        requests.userStatus,
        requests.rfmSegments,
        requests.summary,
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

      const segmentColors: Record<string, string> = {
        rfm_vip:     "oklch(0.72 0.17 60)",
        rfm_active:  "oklch(0.65 0.15 195)",
        rfm_new:     "oklch(0.62 0.17 145)",
        rfm_cooling: "oklch(0.72 0.14 85)",
        rfm_lapsed:  "oklch(0.65 0.15 30)",
        rfm_dormant: "oklch(0.45 0.05 0)",
      };
      const segmentLabels: Record<string, string> = {
        rfm_vip:     "VIP",
        rfm_active:  "Active",
        rfm_new:     "New",
        rfm_cooling: "Cooling",
        rfm_lapsed:  "Lapsed",
        rfm_dormant: "Dormant",
      };
      if (rfmSegmentsRes.status === "fulfilled") {
        const rfmRows = rfmSegmentsRes.value.rows ?? [];
        const trendRows = rfmRows
          .filter((r) => Object.keys(segmentLabels).some((k) => Number(r[k as keyof typeof r] ?? 0) > 0))
          .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")))
          .map((row) => ({
            date: String(row.date ?? ""),
            VIP: Number(row.rfm_vip ?? 0),
            Active: Number(row.rfm_active ?? 0),
            New: Number(row.rfm_new ?? 0),
            "Cooling": Number(row.rfm_cooling ?? 0),
            Lapsed: Number(row.rfm_lapsed ?? 0),
            Dormant: Number(row.rfm_dormant ?? 0),
          }));
        const latestRow = rfmRows
          .filter((r) => Object.keys(segmentLabels).some((k) => Number(r[k as keyof typeof r] ?? 0) > 0))
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        if (latestRow) {
          const segments = Object.keys(segmentLabels)
            .map((key) => ({
              segment: segmentLabels[key],
              count: Number(latestRow[key as keyof typeof latestRow] ?? 0),
              color: segmentColors[key],
              pct: 0,
            }))
            .filter((s) => s.count > 0);
          const total = segments.reduce((sum, s) => sum + s.count, 0) || 1;
          const withPct = segments.map((s) => ({ ...s, pct: Number(((s.count / total) * 100).toFixed(1)) }));
          setLiveSegmentDistribution(withPct);
          setLiveSegmentTrend(
            trendRows.length > 0
              ? trendRows
              : [{
                  date: String(latestRow.date ?? ""),
                  VIP: Number(latestRow.rfm_vip ?? 0),
                  Active: Number(latestRow.rfm_active ?? 0),
                  New: Number(latestRow.rfm_new ?? 0),
                  "Cooling": Number(latestRow.rfm_cooling ?? 0),
                  Lapsed: Number(latestRow.rfm_lapsed ?? 0),
                  Dormant: Number(latestRow.rfm_dormant ?? 0),
                }]
          );
          setHasSegmentData(true);
        } else {
          setLiveSegmentDistribution(null);
          setLiveSegmentTrend(null);
          setHasSegmentData(false);
        }
      } else {
        setLiveSegmentDistribution(null);
        setLiveSegmentTrend(null);
        setHasSegmentData(false);
      }

      if (summaryRes.status === "fulfilled") {
        const s = summaryRes.value;
        const c = s.current;
        const p = s.previous;
        const y = s.ytd;
        const rfm = s.rfm;
        setLiveSummaryMetrics({
          overview: [
            { metric: "Registrations", current: c.registrations, previous: p.registrations, ytd: y.registrations },
            { metric: "FTDs", current: c.ftds, previous: p.ftds, ytd: y.ftds },
            { metric: "FTD Conversion", current: c.ftd_conv_rate, previous: p.ftd_conv_rate, ytd: y.ftd_conv_rate, isPercent: true },
            { metric: "Active Players (Sports)", current: c.actives_sports, previous: p.actives_sports, ytd: y.actives_sports },
            { metric: "Active Players (Casino)", current: c.actives_casino, previous: p.actives_casino, ytd: y.actives_casino },
            { metric: "Total Turnover", current: c.turnover, previous: p.turnover, ytd: y.turnover, isCurrency: true },
            { metric: "Total GGR", current: c.ggr, previous: p.ggr, ytd: y.ggr, isCurrency: true },
            { metric: "NGR", current: c.ngr, previous: p.ngr, ytd: y.ngr, isCurrency: true },
            { metric: "Hold / Margin %", current: c.hold_pct, previous: p.hold_pct, ytd: y.hold_pct, isPercent: true },
            { metric: "Bonus Spent", current: c.bonus_spent, previous: p.bonus_spent, ytd: y.bonus_spent, isCurrency: true },
          ],
          sport: [
            { metric: "Betslips Placed", current: c.sports_bets, previous: p.sports_bets, ytd: y.sports_bets },
            { metric: "Betslips Settled", current: c.sports_settled, previous: p.sports_settled, ytd: y.sports_settled },
            { metric: "Sports Turnover", current: c.sports_turnover, previous: p.sports_turnover, ytd: y.sports_turnover, isCurrency: true },
            { metric: "Sports Winnings", current: c.sports_winnings, previous: p.sports_winnings, ytd: y.sports_winnings, isCurrency: true },
            { metric: "Sports GGR", current: c.sports_ggr, previous: p.sports_ggr, ytd: y.sports_ggr, isCurrency: true },
            { metric: "Hold / Margin %", current: c.sports_hold, previous: p.sports_hold, ytd: y.sports_hold, isPercent: true },
            { metric: "Win Rate %", current: c.win_rate, previous: p.win_rate, ytd: y.win_rate, isPercent: true },
            { metric: "Cancel Rate %", current: c.cancel_rate, previous: p.cancel_rate, ytd: y.cancel_rate, isPercent: true },
            { metric: "Avg Stake / Bet", current: c.avg_stake, previous: p.avg_stake, ytd: y.avg_stake, isCurrency: true },
          ],
          casino: [
            { metric: "Casino Bets", current: c.casino_bets, previous: p.casino_bets, ytd: y.casino_bets },
            { metric: "Casino Stake", current: c.casino_stake, previous: p.casino_stake, ytd: y.casino_stake, isCurrency: true },
            { metric: "Casino Winnings", current: c.casino_winnings, previous: p.casino_winnings, ytd: y.casino_winnings, isCurrency: true },
            { metric: "Casino GGR", current: c.casino_ggr, previous: p.casino_ggr, ytd: y.casino_ggr, isCurrency: true },
            { metric: "Casino Margin %", current: c.casino_margin, previous: p.casino_margin, ytd: y.casino_margin, isPercent: true },
            { metric: "RTP %", current: c.casino_rtp, previous: p.casino_rtp, ytd: y.casino_rtp, isPercent: true },
            { metric: "Active Casino Players", current: c.casino_actives, previous: p.casino_actives, ytd: y.casino_actives },
          ],
          playerHealth: [
            { metric: "VIP Players", current: rfm.vip, previous: 0, ytd: rfm.vip },
            { metric: "Active Players", current: rfm.active, previous: 0, ytd: rfm.active },
            { metric: "New Players", current: rfm.new, previous: 0, ytd: rfm.new },
            { metric: "Cooling Players", current: rfm.cooling, previous: 0, ytd: rfm.cooling },
            { metric: "Lapsed Players", current: rfm.lapsed, previous: 0, ytd: rfm.lapsed },
            { metric: "Dormant Players", current: rfm.dormant, previous: 0, ytd: rfm.dormant },
            { metric: "Self-Exclusions", current: s.self_exclusions, previous: 0, ytd: s.self_exclusions },
          ],
        });
      } else {
        setLiveSummaryMetrics(null);
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
    filters.territory,
    filters.country,
    filters.currentSegment,
    filters.granularity,
  ]);

  // ── Fetch today's (latest date) snapshot independently of the date filter ──
  useEffect(() => {
    if (!latestDataDate) return;
    let cancelled = false;
    Promise.allSettled([
      fetchJson<{ rows: Array<{ date: string; placed_stake?: number; ggr?: number; registrations?: number; actives_sports?: number }> }>(
        `/kpis/daily?start=${latestDataDate}&end=${latestDataDate}&metrics=placed_stake,ggr,registrations,actives_sports`
      ),
      fetchJson<{ points: Array<{ date: string; casino_actives?: number; actives?: number }> }>(
        `/casino/daily?start=${latestDataDate}&end=${latestDataDate}`
      ),
      fetchJson<{ points: Array<{ date: string; ftds?: number }> }>(
        `/ftd/daily?start=${latestDataDate}&end=${latestDataDate}`
      ),
      fetchJson<{ has_data?: boolean; deposits?: number; withdrawals?: number }>(
        `/transactions/kpis?start=${new Date(new Date(latestDataDate).getTime() - 7 * 86400000).toISOString().slice(0, 10)}&end=${latestDataDate}`
      ),
      fetchJson<{ points: Array<{ date: string; bonus_total?: number }> }>(
        `/bonus/daily?start=${latestDataDate}&end=${latestDataDate}`
      ),
    ]).then(([dailyRes, casinoRes, ftdRes, txRes, bonusRes]) => {
      if (cancelled) return;
      const row = dailyRes.status === "fulfilled" ? (dailyRes.value.rows?.[0] ?? null) : null;
      const casinoRow = casinoRes.status === "fulfilled" ? (casinoRes.value.points?.[0] ?? null) : null;
      const ftdRow = ftdRes.status === "fulfilled" ? (ftdRes.value?.points?.[0] ?? null) : null;
      const txKpis = txRes.status === "fulfilled" ? txRes.value : null;
      const bonusRow = bonusRes.status === "fulfilled" ? (bonusRes.value?.points?.[0] ?? null) : null;
      if (row) {
        setLiveTodayKpis({
          ggr: Number(row.ggr ?? 0),
          turnover: Number(row.placed_stake ?? 0),
          registrations: Number(row.registrations ?? 0),
          activeSports: Number(row.actives_sports ?? 0),
          ftds: Number(ftdRow?.ftds ?? 0),
          activeCasino: Number(casinoRow?.casino_actives ?? casinoRow?.actives ?? 0),
          deposits: Number(txKpis?.deposits ?? 0),
          withdrawals: Number(txKpis?.withdrawals ?? 0),
          bonusRedeemed: Number(bonusRow?.bonus_total ?? 0),
          hasTransactionsToday: txKpis?.has_data === true,
        });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [latestDataDate]);

  return {
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
    liveNgr,
    liveBonusSpent,
    liveFtdRegMonth,
    liveUniqueDepositors,
    liveBonusTxIssued,
    liveBonusConverted,
    liveBonusPct,
    liveChurnPct,
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
  };
}
