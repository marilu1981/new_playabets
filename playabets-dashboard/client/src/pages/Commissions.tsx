import { useState } from "react";
/**
 * PLAYA BETS — Commissions Page
 * DWH Views: view_CommissionsSport, view_CommissionsCasino, view_CommissionsPoker
 * Data source: mockData.ts (replace with API calls when VPN available)
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Award, Users, DollarSign, Network } from "lucide-react";
import { commissionSummary, topAgentCommissions, hierarchySummary } from "@/lib/mockData";
import { formatCompact, formatNumber } from "@/lib/formatters";

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
};

const commissionBreakdown = [
  { category: "Sport Direct", amount: commissionSummary.sportDirect },
  { category: "Sport Network", amount: commissionSummary.sportNetwork },
  { category: "Casino Direct", amount: commissionSummary.casinoDirect },
  { category: "Casino Network", amount: commissionSummary.casinoNetwork },
  { category: "Poker Direct", amount: commissionSummary.pokerDirect },
  { category: "Poker Network", amount: commissionSummary.pokerNetwork },
];

export default function CommissionsPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  return (
    <DashboardLayout title="Commissions" subtitle="Agent commissions across sport, casino, and poker"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Commissions" value={`${formatCompact(commissionSummary.totalPaid)}`} subtitle="All products" change={6.2} changeLabel="vs last month" icon={<Award size={18} />} accent="gold" />
        <KpiCard title="Sport Commissions" value={`${formatCompact(commissionSummary.sportDirect + commissionSummary.sportNetwork)}`} subtitle="Direct + Network" icon={<DollarSign size={18} />} accent="teal" />
        <KpiCard title="Total Agents" value={formatNumber(hierarchySummary.totalAgents)} subtitle={`${hierarchySummary.masterAgents} master agents`} icon={<Users size={18} />} accent="green" />
        <KpiCard title="Avg Users / Agent" value={hierarchySummary.avgUsersPerAgent.toFixed(1)} subtitle="Direct users" icon={<Network size={18} />} accent="amber" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Commission breakdown bar */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Commission by Category</h3>
          <p className="text-xs text-white/40 mb-4">Direct vs Network across products</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={commissionBreakdown} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="category" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(v: number) => [`${formatCompact(v)}`, "Commission"]} contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} />
              <Bar dataKey="amount" fill={CHART_COLORS.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Commission summary cards */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-4">Commission Summary</h3>
          <div className="space-y-3">
            {[
              { label: "Sport — Direct", value: commissionSummary.sportDirect, color: CHART_COLORS.gold },
              { label: "Sport — Network", value: commissionSummary.sportNetwork, color: CHART_COLORS.teal },
              { label: "Casino — Direct", value: commissionSummary.casinoDirect, color: CHART_COLORS.green },
              { label: "Casino — Network", value: commissionSummary.casinoNetwork, color: CHART_COLORS.amber },
              { label: "Poker — Direct", value: commissionSummary.pokerDirect, color: "oklch(0.65 0.15 270)" },
              { label: "Poker — Network", value: commissionSummary.pokerNetwork, color: "oklch(0.65 0.15 310)" },
            ].map((item) => {
              const pct = (item.value / commissionSummary.totalPaid * 100).toFixed(1);
              return (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">{item.label}</span>
                    <span className="font-mono" style={{color: item.color }}>
                      {formatCompact(item.value)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top agents */}
      <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <h3 className="text-sm font-semibold text-white mb-1">Top Agents by Commission</h3>
        <p className="text-xs text-white/40 mb-4">view_CommissionsSport — highest earning agents</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Agent ID", "Username", "Direct Users", "Total Stake", "Commissions Earned"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-6 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topAgentCommissions.map((a, i) => (
                <tr key={a.agentId} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-6 text-white/40 text-xs font-mono">#{a.agentId}</td>
                  <td className="py-2.5 pr-6 text-white/80 font-medium">{a.username}</td>
                  <td className="py-2.5 pr-6 text-white/50 text-xs font-mono">{formatNumber(a.directUsers)}</td>
                  <td className="py-2.5 pr-6 text-white/50 text-xs font-mono">{ formatCompact(a.stake)}</td>
                  <td className="py-2.5 font-mono text-sm font-semibold" style={{color: CHART_COLORS.gold }}>
                    {formatCompact(a.commissions)}
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
