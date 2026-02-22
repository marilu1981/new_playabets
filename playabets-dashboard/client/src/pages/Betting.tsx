import { useState } from "react";
/**
 * PLAYA BETS — Betting & Events Page
 * DWH Views: view_Betslips, view_Bets, view_EventProgram
 * Data source: mockData.ts (replace with API calls when VPN available)
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, Activity, Zap, Target } from "lucide-react";
import {
  overviewKPIs, betslipsByStatus, betslipsByType, betsByType,
  betsByApplication, topSports, upcomingEvents,
} from "@/lib/mockData";
import { formatNumber, formatCompact, formatCurrency } from "@/lib/formatters";

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
  const margin = ((overviewKPIs.totalStake - overviewKPIs.totalWinnings) / overviewKPIs.totalStake * 100).toFixed(1);

  return (
    <DashboardLayout title="Betting & Events" subtitle="Betslip analysis, bet types, and event program"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Betslips" value={formatCompact(overviewKPIs.totalBetslips)} subtitle="All time" change={12.1} changeLabel="vs last month" icon={<TrendingUp size={18} />} accent="gold" />
        <KpiCard title="Total Stake" value={`${formatCompact(overviewKPIs.totalStake)}`} subtitle="All betslips" change={9.4} changeLabel="vs last month" icon={<Zap size={18} />} accent="teal" />
        <KpiCard title="Total Winnings" value={`${formatCompact(overviewKPIs.totalWinnings)}`} subtitle="Paid to players" change={8.1} changeLabel="vs last month" icon={<Activity size={18} />} accent="amber" />
        <KpiCard title="Gross Margin" value={`${margin}%`} subtitle="(Stake - Winnings) / Stake" change={0.8} changeLabel="vs last month" icon={<Target size={18} />} accent="green" />
      </div>

      {/* Betslip breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* By Status */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">By Status</h3>
          <p className="text-xs text-white/40 mb-4">view_Betslips — BetslipStatusId</p>
          <div className="space-y-2">
            {betslipsByStatus.map((s) => {
              const pct = (s.count / overviewKPIs.totalBetslips * 100).toFixed(1);
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
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
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
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">By Bet Type</h3>
          <p className="text-xs text-white/40 mb-4">Single / Multiple / Combined</p>
          <div className="space-y-3">
            {betsByType.map((b, i) => {
              const colors = [CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.green, CHART_COLORS.amber];
              const pct = (b.count / betsByType.reduce((a, c) => a + c.count, 0) * 100).toFixed(0);
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
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
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

        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
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

      {/* Event Program */}
      <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
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
