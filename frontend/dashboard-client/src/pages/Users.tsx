/**
 * PLAYA BETS — Users & Players Page
 * DWH Views: view_Users, view_Balances, view_UserSessions, view_UsersSelfexclusions
 * Data source: mockData.ts (replace with API calls when VPN available)
 */

import DashboardLayout from "@/components/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";
import { Users, UserCheck, UserX, Shield, Clock } from "lucide-react";
import {
  overviewKPIs, usersByStatus, userRegistrations, usersByCurrency,
  recentSessions, selfExclusionSummary,
} from "@/lib/mockData";
import { formatNumber, formatCompact } from "@/lib/formatters";

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  red: "oklch(0.55 0.22 25)",
};

export default function UsersPage() {
  return (
    <DashboardLayout title="Users & Players" subtitle="Player lifecycle, sessions, and responsible gaming">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Users" value={formatCompact(overviewKPIs.totalUsers)} subtitle="All time registrations" change={8.4} changeLabel="vs last month" icon={<Users size={18} />} accent="teal" />
        <KpiCard title="Active Users" value={formatCompact(overviewKPIs.activeUsers)} subtitle="Status: Enabled" change={3.2} changeLabel="vs last month" icon={<UserCheck size={18} />} accent="green" />
        <KpiCard title="Frozen / Disabled" value={formatCompact(usersByStatus.find(u => u.status === "Frozen")!.count + usersByStatus.find(u => u.status === "Disabled")!.count)} subtitle="Requires attention" icon={<UserX size={18} />} accent="amber" />
        <KpiCard title="Self-Exclusions" value={selfExclusionSummary.total} subtitle={`${selfExclusionSummary.inProgress} in progress`} change={3.2} changeLabel="vs last month" icon={<Shield size={18} />} accent="red" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Registrations trend */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>User Registrations</h3>
          <p className="text-xs text-white/40 mb-4">Last 12 months — new vs churned</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={userRegistrations} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="month" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={45} />
              <Tooltip contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} />
              <Bar dataKey="registrations" name="New" fill={CHART_COLORS.gold} radius={[2, 2, 0, 0]} />
              <Bar dataKey="churned" name="Churned" fill={CHART_COLORS.red} radius={[2, 2, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Currency breakdown */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Users by Currency</h3>
          <p className="text-xs text-white/40 mb-4">African market distribution</p>
          <div className="space-y-3">
            {usersByCurrency.map((c, i) => {
              const pct = (c.users / overviewKPIs.totalUsers * 100).toFixed(1);
              const colors = [CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.green, CHART_COLORS.red, "oklch(0.72 0.17 60)"];
              return (
                <div key={c.currency}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">{c.currency}</span>
                    <span className="text-white/80 font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>
                      {formatNumber(c.users)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors[i] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* User Status + Self-Exclusion row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* User status breakdown */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>User Status Breakdown</h3>
          <div className="space-y-3">
            {usersByStatus.map((u) => {
              const pct = (u.count / overviewKPIs.totalUsers * 100).toFixed(1);
              return (
                <div key={u.status} className="flex items-center gap-3">
                  <StatusBadge status={u.status} dot className="w-28 justify-start flex-shrink-0" />
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: u.status === "Enabled" ? CHART_COLORS.green : u.status === "Disabled" ? CHART_COLORS.red : u.status === "Frozen" ? CHART_COLORS.teal : "oklch(0.72 0.17 60)",
                      }}
                    />
                  </div>
                  <span className="text-xs text-white/60 font-mono w-16 text-right" style={{ fontFamily: "'Space Mono', monospace" }}>
                    {formatNumber(u.count)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Self-exclusion breakdown */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Self-Exclusion Summary</h3>
          <p className="text-xs text-white/40 mb-4">Responsible gaming — view_UsersSelfexclusions</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "In Progress", value: selfExclusionSummary.inProgress, color: CHART_COLORS.gold },
              { label: "Pending", value: selfExclusionSummary.pending, color: "oklch(0.72 0.17 60)" },
              { label: "Completed", value: selfExclusionSummary.completed, color: CHART_COLORS.green },
            ].map((s) => (
              <div key={s.label} className="text-center p-3 rounded-lg" style={{ background: "oklch(0.22 0.04 155)" }}>
                <div className="text-xl font-bold mb-1" style={{ fontFamily: "'Space Mono', monospace", color: s.color }}>{s.value}</div>
                <div className="text-xs text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {selfExclusionSummary.byPeriod.map((p) => (
              <div key={p.period} className="flex items-center justify-between text-xs">
                <span className="text-white/50">{p.period}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(p.count / selfExclusionSummary.total) * 100}%`, background: CHART_COLORS.red }} />
                  </div>
                  <span className="text-white/60 w-6 text-right font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>{p.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} style={{ color: "oklch(0.72 0.14 85)" }} />
          <h3 className="text-sm font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>Recent Sessions</h3>
          <span className="text-xs text-white/30">— view_UserSessions</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Session ID", "User ID", "Username", "Login Time", "IP Address", "Platform", "State"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentSessions.map((s) => (
                <tr key={s.sessionId} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-4 text-white/40 text-xs font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>#{s.sessionId}</td>
                  <td className="py-2.5 pr-4 text-white/40 text-xs font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>{s.userId}</td>
                  <td className="py-2.5 pr-4 text-white/80 text-sm">{s.username}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>{s.loginDate.split(" ")[1]}</td>
                  <td className="py-2.5 pr-4 text-white/40 text-xs font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>{s.ip}</td>
                  <td className="py-2.5 pr-4 text-white/60 text-xs">{s.app}</td>
                  <td className="py-2.5"><StatusBadge status={s.state} dot /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
