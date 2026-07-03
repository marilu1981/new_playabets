/**
 * PLAYA BETS - Betting & Events Page
 */

import { useEffect, useMemo, useState } from "react";
import { cachedFetch } from "@/lib/apiCache";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import { usePersistedFilters } from "@/lib/usePersistedFilters";
import KpiCard from "@/components/KpiCard";
import MockOverlay from "@/components/MockOverlay";
import StatusBadge from "@/components/StatusBadge";

import {
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { TrendingUp, Activity, Zap, Target } from "lucide-react";
import {
  overviewKPIs as baseOverviewKPIs,
  betslipsByStatus as baseBetslipsByStatus,
  betslipsByType as baseBetslipsByType,
} from "@/lib/mockData";
import { formatCompact, formatFull } from "@/lib/formatters";
import { aggregateByGranularity } from "@/pages/home/homeUtils";
import {
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const COLORS = { gold: "#ffb500", green: "#7ab800", teal: "#0d8f8f", amber: "#e07b00", red: "#d94040" };
const CARD_BG = { background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const TT_STYLE = { background: "#fff", border: "1px solid #e4ece4", fontSize: 11 };

const PIE_COLORS = [COLORS.gold, COLORS.teal, COLORS.amber, COLORS.green, COLORS.red];

interface DailyTrendPoint {
  date: string;
  settled_stake: number;
  settled_winnings: number;
  ggr: number;
  betslips_count: number;
}

export default function BettingPage() {
  const [filters, setFilters] = usePersistedFilters();
  const [liveOverviewKPIs, setLiveOverviewKPIs] = useState<typeof baseOverviewKPIs | null>(null);
  const [liveBetslipsByStatus, setLiveBetslipsByStatus] = useState<typeof baseBetslipsByStatus | null>(null);
  const [liveBetslipsByType, setLiveBetslipsByType] = useState<typeof baseBetslipsByType | null>(null);
  const [liveSettlementMetrics, setLiveSettlementMetrics] = useState<{
    settledCount: number;
    wonCount: number;
    cancelledCount: number;
    cancelRate: number;
    openExposureStake: number;
  } | null>(null);
  const [liveStakeTrend, setLiveStakeTrend] = useState<DailyTrendPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ start: filters.dateFrom, end: filters.dateTo });
    if (filters.territory !== "all") params.set("territory", filters.territory);
    if (filters.country !== "all") params.set("country", filters.country);
    const query = params.toString();
    Promise.allSettled([
      fetchJson<{
        settled_stake?: number;
        winnings?: number;
        ggr?: number;
        betslips?: number;
      }>(`/sportsbook/kpis?${query}`),
      fetchJson<Array<{ status?: string; statusId?: number | null; count?: number }>>(
        `/betting/betslips-by-status?${query}`
      ),
      fetchJson<Array<{ type?: string; typeId?: number | null; count?: number }>>(
        `/betting/betslips-by-type?${query}`
      ),
      fetchJson<{
        rows: Array<{
          date: string;
          open_exposure_stake?: number;
          betslips_settled_count?: number;
          betslips_won_count?: number;
          betslips_cancelled_count?: number;
          cancel_rate?: number;
          settled_stake?: number;
          settled_winnings?: number;
          ggr?: number;
          betslips_count?: number;
        }>;
      }>(`/kpis/daily?${query}&metrics=open_exposure_stake,betslips_settled_count,betslips_won_count,betslips_cancelled_count,cancel_rate,settled_stake,settled_winnings,ggr,betslips_count`),
    ])
      .then(([kpisRes, statusRes, typeRes, settlementRes]) => {
        if (cancelled) return;

        if (kpisRes.status === "fulfilled") {
          const stake = Number(kpisRes.value.settled_stake ?? 0);
          const winnings = Number(kpisRes.value.winnings ?? 0);
          const bets = Number(kpisRes.value.betslips ?? 0);
          if (stake > 0 || bets > 0) {
            setLiveOverviewKPIs({ ...baseOverviewKPIs, totalStake: stake, totalWinnings: winnings, totalBetslips: bets });
          } else {
            setLiveOverviewKPIs(null);
          }
        }

        if (statusRes.status === "fulfilled") {
          const rows = statusRes.value
            .map((row) => ({ status: String(row.status ?? "Unknown"), statusId: Number(row.statusId ?? 0), count: Number(row.count ?? 0) }))
            .filter((row) => row.count > 0);
          setLiveBetslipsByStatus(rows.length > 0 ? rows : null);
        }

        if (typeRes.status === "fulfilled") {
          const rows = typeRes.value
            .map((row) => ({ type: String(row.type ?? "Unknown"), typeId: Number(row.typeId ?? 0), count: Number(row.count ?? 0) }))
            .filter((row) => row.count > 0);
          setLiveBetslipsByType(rows.length > 0 ? rows : null);
        }

        if (settlementRes.status === "fulfilled") {
          const rows = settlementRes.value.rows ?? [];
          if (rows.length > 0) {
            const totals = rows.reduce(
              (acc, row) => ({
                settledCount: acc.settledCount + Number(row.betslips_settled_count ?? 0),
                wonCount: acc.wonCount + Number(row.betslips_won_count ?? 0),
                cancelledCount: acc.cancelledCount + Number(row.betslips_cancelled_count ?? 0),
                cancelRateSum: acc.cancelRateSum + Number(row.cancel_rate ?? 0),
              }),
              { settledCount: 0, wonCount: 0, cancelledCount: 0, cancelRateSum: 0 },
            );
            const latestRow = rows[rows.length - 1];
            setLiveSettlementMetrics({
              settledCount: totals.settledCount,
              wonCount: totals.wonCount,
              cancelledCount: totals.cancelledCount,
              cancelRate: rows.length > 0 ? Number((totals.cancelRateSum / rows.length * 100).toFixed(1)) : 0,
              openExposureStake: Number(latestRow?.open_exposure_stake ?? 0),
            });

            const trendRows = rows
              .filter((r) => Number(r.settled_stake ?? 0) > 0 || Number(r.betslips_count ?? 0) > 0)
              .map((r) => ({
                date: r.date,
                settled_stake: Number(r.settled_stake ?? 0),
                settled_winnings: Number(r.settled_winnings ?? 0),
                ggr: Number(r.ggr ?? 0),
                betslips_count: Number(r.betslips_count ?? 0),
              }));
            setLiveStakeTrend(trendRows);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveOverviewKPIs(null);
          setLiveBetslipsByStatus(null);
          setLiveBetslipsByType(null);
          setLiveSettlementMetrics(null);
        }
      });

    return () => { cancelled = true; };
  }, [filters.dateFrom, filters.dateTo, filters.territory, filters.country]);

  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const overviewKPIs = useMemo(() => {
    if (liveOverviewKPIs) return liveOverviewKPIs;
    return scaleObjectNumericFields(baseOverviewKPIs, multiplier, ["currency"]);
  }, [multiplier, liveOverviewKPIs]);

  const aggregatedStakeTrend = useMemo(() => {
    if (!liveStakeTrend.length || filters.granularity === "daily") return liveStakeTrend;
    return aggregateByGranularity(
      liveStakeTrend as unknown as Record<string, unknown>[],
      filters.granularity,
      (r) => r["date"] as string,
    ) as unknown as typeof liveStakeTrend;
  }, [liveStakeTrend, filters.granularity]);

  const betslipsByStatus = useMemo(
    () => scaleArrayNumericFields(liveBetslipsByStatus ?? baseBetslipsByStatus, liveBetslipsByStatus ? 1 : multiplier, ["status", "statusId"]),
    [liveBetslipsByStatus, multiplier],
  );
  const betslipsByType = useMemo(
    () => scaleArrayNumericFields(liveBetslipsByType ?? baseBetslipsByType, liveBetslipsByType ? 1 : multiplier, ["type", "typeId"]),
    [liveBetslipsByType, multiplier],
  );
  const totalBetslipsSafe = Math.max(1, liveBetslipsByStatus ? betslipsByStatus.reduce((s, r) => s + r.count, 0) : overviewKPIs.totalBetslips);
  const margin = overviewKPIs.totalStake > 0
    ? ((overviewKPIs.totalStake - overviewKPIs.totalWinnings) / overviewKPIs.totalStake * 100).toFixed(1)
    : "0.0";

  return (
    <DashboardLayout title="Betting & Events" subtitle="Betslip analysis, bet types, and settlement"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>

      {/* KPI Row */}
      <div className="relative mb-6">
        <MockOverlay active={!liveOverviewKPIs} badge label="Pending Data" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="Total Betslips"  value={formatFull(overviewKPIs.totalBetslips)} subtitle="Selected range" icon={<TrendingUp size={18} />} accent="gold" />
          <KpiCard title="Total Stake"     value={formatFull(overviewKPIs.totalStake)}    subtitle="Selected range" icon={<Zap size={18} />}         accent="teal" />
          <KpiCard title="Total Winnings"  value={formatFull(overviewKPIs.totalWinnings)} subtitle="Paid to players" icon={<Activity size={18} />}  accent="amber" />
          <KpiCard title="Gross Margin"    value={`${margin}%`}                           subtitle="(Stake - Winnings) / Stake" icon={<Target size={18} />} accent="green" />
        </div>
      </div>

      {/* Settlement Monitor */}
      <div className="relative rounded-xl p-5 mb-6" style={CARD_BG}>
        <MockOverlay active={!liveSettlementMetrics} badge label="Pending Data" />
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Bet Settlement Monitor</h3>
          <p className="text-xs text-gray-400">Settlement flow, cancellations, and current exposure</p>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard title="Settled Betslips"   value={formatFull(liveSettlementMetrics?.settledCount ?? 0)}   subtitle="Selected range"              icon={<TrendingUp size={18} />} accent="gold" />
          <KpiCard title="Won Betslips"        value={formatFull(liveSettlementMetrics?.wonCount ?? 0)}       subtitle="Selected range"              icon={<Target size={18} />}     accent="green" />
          <KpiCard title="Cancelled Betslips"  value={formatFull(liveSettlementMetrics?.cancelledCount ?? 0)} subtitle="Selected range"              icon={<Activity size={18} />}   accent="amber" />
          <KpiCard title="Cancel Rate"         value={`${liveSettlementMetrics?.cancelRate ?? 0}%`}           subtitle="% of settled stake"          icon={<Zap size={18} />}        accent="red" />
        </div>
      </div>

      {/* Stake trend */}
      <div className="rounded-xl p-5 mb-6" style={CARD_BG}>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Stake vs Winnings vs GGR</h3>
        <p className="text-xs text-gray-400 mb-4">Sportsbook activity - {filters.granularity} view</p>
        {aggregatedStakeTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={aggregatedStakeTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="stakeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.teal} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.teal} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="winGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ggrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }}
                tickFormatter={(v) => filters.granularity === "monthly" ? v.slice(0, 7) : v.slice(5)}
                interval={filters.granularity === "daily" ? 4 : 0} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={62} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatFull(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="settled_stake"    name="Stake"    stroke={COLORS.teal}  fill="url(#stakeGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="settled_winnings" name="Winnings" stroke={COLORS.amber} fill="url(#winGrad)"   strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="ggr"              name="GGR"      stroke={COLORS.green} fill="url(#ggrGrad)"   strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">
            No sportsbook trend data for this period
          </div>
        )}
      </div>

      {/* Betslip breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* By Status */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={!liveBetslipsByStatus} badge label="Loading" />
          <h3 className="text-sm font-semibold text-gray-800 mb-1">By Betslip Status</h3>
          <p className="text-xs text-gray-400 mb-4">Count by status - selected period</p>
          <div className="space-y-2">
            {betslipsByStatus.map((s) => {
              const pct = (s.count / totalBetslipsSafe * 100).toFixed(1);
              return (
                <div key={s.status}>
                  <div className="flex justify-between text-xs mb-1">
                    <StatusBadge status={s.status} />
                    <span className="text-gray-500 font-mono">{formatCompact(s.count)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS.gold }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Type (Normal/Live/Mixed) */}
        <div className="relative rounded-xl p-5" style={CARD_BG}>
          <MockOverlay active={!liveBetslipsByType} badge label="Loading" />
          <h3 className="text-sm font-semibold text-gray-800 mb-1">By Betslip Type</h3>
          <p className="text-xs text-gray-400 mb-4">Normal / Live / Mixed split</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={betslipsByType} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="count" nameKey="type" paddingAngle={3}>
                {betslipsByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatCompact(v)} contentStyle={TT_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {betslipsByType.map((t, i) => (
              <div key={t.type} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600">{t.type}</span>
                </div>
                <span className="text-gray-700 font-mono">{formatCompact(t.count)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Win/Cancel breakdown */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Outcome Breakdown</h3>
          <p className="text-xs text-gray-400 mb-4">Settled betslip outcomes - selected period</p>
          {liveSettlementMetrics ? (
            <div className="space-y-4">
              {[
                { label: "Won", count: liveSettlementMetrics.wonCount, color: COLORS.green },
                { label: "Cancelled", count: liveSettlementMetrics.cancelledCount, color: COLORS.amber },
                { label: "Other Settled", count: Math.max(0, liveSettlementMetrics.settledCount - liveSettlementMetrics.wonCount - liveSettlementMetrics.cancelledCount), color: COLORS.teal },
              ].map((item) => {
                const pct = liveSettlementMetrics.settledCount > 0
                  ? (item.count / liveSettlementMetrics.settledCount * 100).toFixed(1)
                  : "0.0";
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{item.label}</span>
                      <span className="font-mono text-gray-500">{formatCompact(item.count)} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: item.color }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Cancel Rate</span>
                  <span className="font-mono font-semibold" style={{ color: COLORS.amber }}>{liveSettlementMetrics.cancelRate}%</span>
                </div>
                {liveSettlementMetrics.openExposureStake > 0 && (
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Open Exposure</span>
                    <span className="font-mono font-semibold" style={{ color: COLORS.red }}>{formatFull(liveSettlementMetrics.openExposureStake)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-xs text-gray-400">
              No settlement data for this period
            </div>
          )}
        </div>
      </div>

    </DashboardLayout>
  );
}
