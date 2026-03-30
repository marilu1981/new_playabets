/**
 * PLAYA BETS — Betting & Events Page
 * DWH Views: view_Betslips, view_Bets, view_EventProgram
 * Data source: Supabase daily_kpis table via /api/sportsbook/kpis
 */

import { useEffect, useMemo, useState } from "react";
import { cachedFetch } from "@/lib/apiCache";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import MockOverlay from "@/components/MockOverlay";
import StatusBadge from "@/components/StatusBadge";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, Activity, Zap, Target } from "lucide-react";
import {
  overviewKPIs as baseOverviewKPIs,
  betslipsByStatus as baseBetslipsByStatus,
  betslipsByType as baseBetslipsByType,
  betsByType as baseBetsByType,
  betsByApplication as baseBetsByApplication,
  topSports as baseTopSports,
  upcomingEvents as baseUpcomingEvents,
} from "@/lib/mockData";
import { formatNumber, formatCompact, formatCurrency } from "@/lib/formatters";
import {
  filterByDateRange,
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
  red: "oklch(0.55 0.22 25)",
};

const PIE_COLORS = [CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.amber];

export default function BettingPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
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

  useEffect(() => {
    let cancelled = false;
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
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
        }>;
      }>(`/kpis/daily?${query}&metrics=open_exposure_stake,betslips_settled_count,betslips_won_count,betslips_cancelled_count,cancel_rate`),
    ])
      .then(([kpisRes, statusRes, typeRes, settlementRes]) => {
        if (cancelled) {
          return;
        }

        if (kpisRes.status === "fulfilled") {
          const stake = Number(kpisRes.value.settled_stake ?? 0);
          const winnings = Number(kpisRes.value.winnings ?? 0);
          const bets = Number(kpisRes.value.betslips ?? 0);
          if (stake > 0 || bets > 0) {
            setLiveOverviewKPIs({
              ...baseOverviewKPIs,
              totalStake: stake,
              totalWinnings: winnings,
              totalBetslips: bets,
            });
          } else {
            setLiveOverviewKPIs(null);
          }
        } else {
          setLiveOverviewKPIs(null);
        }

        if (statusRes.status === "fulfilled") {
          const rows = statusRes.value
            .map((row) => ({
              status: String(row.status ?? "Unknown"),
              statusId: Number(row.statusId ?? 0),
              count: Number(row.count ?? 0),
            }))
            .filter((row) => row.count > 0);
          setLiveBetslipsByStatus(rows.length > 0 ? rows : null);
        } else {
          setLiveBetslipsByStatus(null);
        }

        if (typeRes.status === "fulfilled") {
          const rows = typeRes.value
            .map((row) => ({
              type: String(row.type ?? "Unknown"),
              typeId: Number(row.typeId ?? 0),
              count: Number(row.count ?? 0),
            }))
            .filter((row) => row.count > 0);
          setLiveBetslipsByType(rows.length > 0 ? rows : null);
        } else {
          setLiveBetslipsByType(null);
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
              cancelRate: rows.length > 0 ? Number((totals.cancelRateSum / rows.length).toFixed(1)) : 0,
              openExposureStake: Number(latestRow?.open_exposure_stake ?? 0),
            });
          } else {
            setLiveSettlementMetrics(null);
          }
        } else {
          setLiveSettlementMetrics(null);
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

    return () => {
      cancelled = true;
    };
  }, [filters.dateFrom, filters.dateTo]);

  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const overviewKPIs = useMemo(() => {
    if (liveOverviewKPIs) return liveOverviewKPIs;
    return scaleObjectNumericFields(baseOverviewKPIs, multiplier, ["currency"]);
  }, [multiplier, liveOverviewKPIs]);

  const pageMode = useMemo(() => {
    if (liveOverviewKPIs || liveBetslipsByStatus || liveBetslipsByType || liveSettlementMetrics) {
      return "partial";
    }
    return "mock";
  }, [liveBetslipsByStatus, liveBetslipsByType, liveOverviewKPIs, liveSettlementMetrics]);

  const betslipsByStatus = useMemo(
    () =>
      scaleArrayNumericFields(
        liveBetslipsByStatus ?? baseBetslipsByStatus,
        liveBetslipsByStatus ? 1 : multiplier,
        ["status", "statusId"],
      ),
    [liveBetslipsByStatus, multiplier],
  );
  const betslipsByType = useMemo(
    () =>
      scaleArrayNumericFields(
        liveBetslipsByType ?? baseBetslipsByType,
        liveBetslipsByType ? 1 : multiplier,
        ["type", "typeId"],
      ),
    [liveBetslipsByType, multiplier],
  );
  const betsByType = useMemo(
    () => scaleArrayNumericFields(baseBetsByType, multiplier, ["betType"]),
    [multiplier],
  );
  const betsByApplication = useMemo(
    () => scaleArrayNumericFields(baseBetsByApplication, multiplier, ["app", "percentage"]),
    [multiplier],
  );
  const topSports = useMemo(
    () => scaleArrayNumericFields(baseTopSports, multiplier, ["sport", "sportId"]),
    [multiplier],
  );
  const upcomingEvents = useMemo(
    () =>
      scaleArrayNumericFields(
        filterByDateRange(baseUpcomingEvents, filters, (row) => row.startDate),
        multiplier,
        ["eventId", "sport", "event", "startDate", "status"],
      ),
    [filters, multiplier],
  );
  const totalBetslipsSafe = Math.max(
    1,
    liveBetslipsByStatus
      ? betslipsByStatus.reduce((sum, row) => sum + row.count, 0)
      : overviewKPIs.totalBetslips,
  );
  const totalBetTypeCount = Math.max(1, betsByType.reduce((sum, row) => sum + row.count, 0));
  const margin = overviewKPIs.totalStake > 0
    ? ((overviewKPIs.totalStake - overviewKPIs.totalWinnings) / overviewKPIs.totalStake * 100).toFixed(1)
    : "0.0";

  return (
    <DashboardLayout title="Betting & Events" subtitle="Betslip analysis, bet types, and event program"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      <div className="text-xs text-white/50 mb-3">
        Data mode: {pageMode === "partial" ? "Partial Live" : "Mock"}
      </div>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Betslips" value={formatCompact(overviewKPIs.totalBetslips)} subtitle="All time" change={12.1} changeLabel="vs last month" icon={<TrendingUp size={18} />} accent="gold" />
        <KpiCard title="Total Stake" value={`${formatCompact(overviewKPIs.totalStake)}`} subtitle="All betslips" change={9.4} changeLabel="vs last month" icon={<Zap size={18} />} accent="teal" />
        <KpiCard title="Total Winnings" value={`${formatCompact(overviewKPIs.totalWinnings)}`} subtitle="Paid to players" change={8.1} changeLabel="vs last month" icon={<Activity size={18} />} accent="amber" />
        <KpiCard title="Gross Margin" value={`${margin}%`} subtitle="(Stake - Winnings) / Stake" change={0.8} changeLabel="vs last month" icon={<Target size={18} />} accent="green" />
      </div>

      <div className="relative rounded-xl p-5 mb-6" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <MockOverlay active={!liveSettlementMetrics} badge label="Pending Data" />
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white mb-1">Bet Settlement Monitor</h3>
          <p className="text-xs text-white/40">Settlement flow, cancellations, and current exposure</p>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <KpiCard title="Settled Betslips" value={formatCompact(liveSettlementMetrics?.settledCount ?? 0)} subtitle="Selected range" icon={<TrendingUp size={18} />} accent="gold" />
          <KpiCard title="Won Betslips" value={formatCompact(liveSettlementMetrics?.wonCount ?? 0)} subtitle="Selected range" icon={<Target size={18} />} accent="green" />
          <KpiCard title="Cancelled Betslips" value={formatCompact(liveSettlementMetrics?.cancelledCount ?? 0)} subtitle="Selected range" icon={<Activity size={18} />} accent="amber" />
          <KpiCard title="Cancel Rate" value={`${liveSettlementMetrics?.cancelRate ?? 0}%`} subtitle="Average across selected days" icon={<Zap size={18} />} accent="red" />
          <KpiCard title="Open Exposure" value={formatCurrency(liveSettlementMetrics?.openExposureStake ?? 0)} subtitle="Latest available day" icon={<TrendingUp size={18} />} accent="teal" />
        </div>
      </div>

      {/* Betslip breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* By Status */}
        <div className="relative rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <MockOverlay active={!liveBetslipsByStatus} badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-white mb-1">By Status</h3>
          <p className="text-xs text-white/40 mb-4">view_Betslips — BetslipStatusId</p>
          <div className="space-y-2">
            {betslipsByStatus.map((s) => {
              const pct = (s.count / totalBetslipsSafe * 100).toFixed(1);
              return (
                <div key={s.status}>
                  <div className="flex justify-between text-xs mb-1">
                    <StatusBadge status={s.status} />
                    <span className="text-white/60 font-mono">{formatCompact(s.count)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CHART_COLORS.gold }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Type (Normal/Live/Mixed) */}
        <div className="relative rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <MockOverlay active={!liveBetslipsByType} badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-white mb-1">By Betslip Type</h3>
          <p className="text-xs text-white/40 mb-4">Normal / Live / Mixed</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={betslipsByType} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="count" nameKey="type" paddingAngle={3}>
                {betslipsByType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => formatCompact(v)} contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {betslipsByType.map((t, i) => (
              <div key={t.type} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i] }} />
                  <span className="text-white/50">{t.type}</span>
                </div>
                <span className="text-white/70 font-mono">{formatCompact(t.count)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Bet Type (Single/Multiple) */}
        <div className="relative rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <MockOverlay active badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-white mb-1">By Bet Type</h3>
          <p className="text-xs text-white/40 mb-4">Single / Multiple / Combined</p>
          <div className="space-y-3">
            {betsByType.map((b, i) => {
              const colors = [CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.green, CHART_COLORS.amber];
              const pct = (b.count / totalBetTypeCount * 100).toFixed(0);
              return (
                <div key={b.betType}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">{b.betType}</span>
                    <span className="text-white/80 font-mono">
                      {formatCompact(b.count)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors[i] }} />
                  </div>
                  <div className="text-xs text-white/30 mt-0.5">Stake: {formatCompact(b.stake)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Sports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="relative rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <MockOverlay active badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-white mb-1">Top Sports by Stake</h3>
          <p className="text-xs text-white/40 mb-4">Total stake by sport</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topSports.slice(0, 7)} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="sport" tick={{ fill: "oklch(0.65 0.02 0)", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip formatter={(v: number) => [`${formatCompact(v)}`, "Stake"]} contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} />
              <Bar dataKey="stake" fill={CHART_COLORS.teal} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="relative rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <MockOverlay active badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-white mb-1">Sport Revenue Table</h3>
          <p className="text-xs text-white/40 mb-4">Bets, stake, and gross revenue per sport</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                  {["Sport", "Bets", "Stake", "Revenue", "Margin"].map((h) => (
                    <th key={h} className="text-left font-semibold uppercase tracking-wider text-white/30 pb-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topSports.map((s) => (
                  <tr key={s.sport} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                    <td className="py-2 pr-3 text-white/80 font-medium">{s.sport}</td>
                    <td className="py-2 pr-3 text-white/50 font-mono">{formatCompact(s.bets)}</td>
                    <td className="py-2 pr-3 text-white/50 font-mono">{ formatCompact(s.stake)}</td>
                    <td className="py-2 pr-3 font-mono" style={{color: CHART_COLORS.gold }}>{ formatCompact(s.revenue)}</td>
                    <td className="py-2">
                      <span className="text-xs" style={{ color: CHART_COLORS.green }}>
                        {(s.revenue / s.stake * 100).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Betslip Status */}
      {(() => {
        const STATUS_COLORS = ["oklch(0.62 0.17 145)", "oklch(0.55 0.22 25)", "oklch(0.72 0.17 60)", "oklch(0.65 0.15 195)", "#6b7280"];
        const totalSafe = Math.max(1, betslipsByStatus.reduce((sum, r) => sum + r.count, 0));
        return (
          <div className="relative rounded-xl p-5 mb-6" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
            <MockOverlay active={!liveBetslipsByStatus} description="Betslip status pending live data" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Betslip Status</h3>
                <p className="text-xs text-white/40">Distribution by status</p>
              </div>
              {liveBetslipsByStatus ? (
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.62 0.17 145 / 15%)", color: CHART_COLORS.green }}>Live</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: CHART_COLORS.teal }}>Mock</span>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={betslipsByStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="count" nameKey="status" paddingAngle={2}>
                    {betslipsByStatus.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCompact(v)} contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {betslipsByStatus.map((row, i) => (
                  <div key={row.status} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                      <span className="text-white/60">{row.status}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono text-white/80">{formatCompact(row.count)}</span>
                      <span className="text-xs text-white/40 ml-1">({(row.count / totalSafe * 100).toFixed(1)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Event Program */}
      <div className="relative rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <MockOverlay active badge label="Mock Data" />
        <h3 className="text-sm font-semibold text-white mb-1">Event Program</h3>
        <p className="text-xs text-white/40 mb-4">view_EventProgram — upcoming and live events</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Event ID", "Sport", "Event Name", "Start Time", "Status", "Open Bets"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcomingEvents.map((e) => (
                <tr key={e.eventId} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-4 text-white/40 text-xs font-mono">#{e.eventId}</td>
                  <td className="py-2.5 pr-4 text-white/60 text-xs">{e.sport}</td>
                  <td className="py-2.5 pr-4 text-white/80 font-medium">{e.event}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono">{e.startDate}</td>
                  <td className="py-2.5 pr-4"><StatusBadge status={e.status} dot /></td>
                  <td className="py-2.5 text-right font-mono text-xs" style={{color: CHART_COLORS.gold }}>{formatNumber(e.openBets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
