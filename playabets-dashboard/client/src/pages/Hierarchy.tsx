import { useMemo, useState } from "react";
/**
 * PLAYA BETS — Hierarchy & Roles Page
 * DWH Views: view_Hierarchy, view_UserRoles
 * Data source: mockData.ts (replace with API calls when VPN available)
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import { Network, Users, UserCheck, TrendingUp } from "lucide-react";
import {
  hierarchySummary as baseHierarchySummary,
  topAgents as baseTopAgents,
} from "@/lib/mockData";
import { formatNumber, formatCompact } from "@/lib/formatters";
import {
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
};

export default function HierarchyPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const hierarchySummary = useMemo(
    () => scaleObjectNumericFields(baseHierarchySummary, multiplier),
    [multiplier],
  );
  const topAgents = useMemo(
    () => scaleArrayNumericFields(baseTopAgents, multiplier, ["agentId", "username"]),
    [multiplier],
  );
  const hierarchyLevels = useMemo(
    () => [
      { level: "Operator", count: 1, description: "Platform owner - full access", color: CHART_COLORS.gold },
      { level: "Master Agent", count: hierarchySummary.masterAgents, description: "Top-level agents with sub-agent networks", color: CHART_COLORS.teal },
      { level: "Sub-Agent", count: hierarchySummary.subAgents, description: "Direct player-facing agents", color: CHART_COLORS.green },
      { level: "Player", count: hierarchySummary.totalUsers, description: "End users / bettors", color: CHART_COLORS.amber },
    ],
    [hierarchySummary.masterAgents, hierarchySummary.subAgents, hierarchySummary.totalUsers],
  );
  return (
    <DashboardLayout title="Hierarchy & Roles" subtitle="Agent network structure and role assignments"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Agents" value={formatNumber(hierarchySummary.totalAgents)} subtitle="All levels" icon={<Network size={18} />} accent="gold" />
        <KpiCard title="Master Agents" value={hierarchySummary.masterAgents} subtitle="Top-level agents" icon={<UserCheck size={18} />} accent="teal" />
        <KpiCard title="Sub-Agents" value={formatNumber(hierarchySummary.subAgents)} subtitle="Under master agents" icon={<Users size={18} />} accent="green" />
        <KpiCard title="Avg Users / Agent" value={hierarchySummary.avgUsersPerAgent.toFixed(1)} subtitle="Direct players per agent" icon={<TrendingUp size={18} />} accent="amber" />
      </div>

      {/* Hierarchy tree */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Hierarchy Structure</h3>
          <p className="text-xs text-white/40 mb-6">view_Hierarchy — role levels</p>
          <div className="space-y-3">
            {hierarchyLevels.map((level, i) => (
              <div key={level.level} className="relative">
                {i < hierarchyLevels.length - 1 && (
                  <div className="absolute left-5 top-full h-3 w-px" style={{ background: "oklch(1 0 0 / 10%)" }} />
                )}
                <div className="flex items-center gap-4 p-4 rounded-lg" style={{ background: "oklch(0.22 0.04 155)", border: `1px solid ${level.color}25` }}>
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: `${level.color}20`, color: level.color, border: `1px solid ${level.color}40` }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">{level.level}</div>
                    <div className="text-xs text-white/40">{level.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-mono" style={{color: level.color }}>
                      {formatCompact(level.count)}
                    </div>
                    <div className="text-xs text-white/30">accounts</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Role permissions overview */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Role Permissions Matrix</h3>
          <p className="text-xs text-white/40 mb-4">view_UserRoles — access levels</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                  <th className="text-left text-white/30 pb-2 pr-3 font-semibold uppercase tracking-wider">Permission</th>
                  {["Operator", "Master", "Sub-Agent", "Player"].map((r) => (
                    <th key={r} className="text-center text-white/30 pb-2 px-2 font-semibold uppercase tracking-wider">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { perm: "View Reports", op: true, master: true, sub: true, player: false },
                  { perm: "Manage Users", op: true, master: true, sub: false, player: false },
                  { perm: "Create Campaigns", op: true, master: false, sub: false, player: false },
                  { perm: "View Commissions", op: true, master: true, sub: true, player: false },
                  { perm: "Place Bets", op: false, master: false, sub: false, player: true },
                  { perm: "Withdraw Funds", op: true, master: true, sub: true, player: true },
                  { perm: "DWH Access", op: true, master: false, sub: false, player: false },
                ].map((row) => (
                  <tr key={row.perm} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                    <td className="py-2 pr-3 text-white/60">{row.perm}</td>
                    {[row.op, row.master, row.sub, row.player].map((has, i) => (
                      <td key={i} className="py-2 px-2 text-center">
                        {has ? (
                          <span style={{ color: CHART_COLORS.green }}>✓</span>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Top agents table */}
      <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <h3 className="text-sm font-semibold text-white mb-1">Top Agents by Network Size</h3>
        <p className="text-xs text-white/40 mb-4">view_Hierarchy — agents with most direct users</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Agent ID", "Username", "Direct Users", "Total Stake"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-6 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topAgents.map((a) => (
                <tr key={a.agentId} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-6 text-white/40 text-xs font-mono">#{a.agentId}</td>
                  <td className="py-2.5 pr-6 text-white/80 font-medium">{a.username}</td>
                  <td className="py-2.5 pr-6 text-white/50 text-xs font-mono">{formatNumber(a.directUsers)}</td>
                  <td className="py-2.5 pr-6 text-white/50 text-xs font-mono">{ formatCompact(a.stake)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
