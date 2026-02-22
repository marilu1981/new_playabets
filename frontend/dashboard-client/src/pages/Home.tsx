/**
 * PLAYA BETS — Overview Dashboard Page
 * Savanna Gold design: KPI row + revenue chart + betslip breakdown + top sports
 * Data source: mockData.ts (replace with API calls when VPN available)
 */

import DashboardLayout from "@/components/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, TrendingUp, DollarSign, Activity,
  ShieldCheck, Gift, Gamepad2, Zap,
} from "lucide-react";
import {
  overviewKPIs, revenueTrend, betslipsByStatus, topSports,
  betsByApplication, usersByStatus, upcomingEvents,
} from "@/lib/mockData";
import { formatCompact, formatCurrency, formatNumber } from "@/lib/formatters";

const HERO_BG = "https://private-us-east-1.manuscdn.com/sessionFile/cKq6wfrB6w3tj51hFB9kbf/sandbox/bUQudPFuU0QLod3pzEsnEY-img-2_1771727908000_na1fn_cGxheWFiZXRzLWhlcm8tYmFubmVy.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvY0txNndmckI2dzN0ajUxaEZCOWtiZi9zYW5kYm94L2JVUXVkUEZ1VTBRTG9kM3B6RXNuRVktaW1nLTJfMTc3MTcyNzkwODAwMF9uYTFmbl9jR3hoZVdGaVpYUnpMV2hsY204dFltRnVibVZ5LnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=LHsnks1NO7SQ87OPqfr8X3UCWGKR~-4dFr0yVglkj0GAbZntP4Bq2VV88L-8FWkj-8edRLrlOJK73a4zD7Y7gnEAI9d6hcIeI7KCSJrwwvRW6UB4wYIBKcBGFFUxVdkuimzCKyEvj9PaaWLFw9ouP3Vbvp~P0BXrFkfjceNgumru40JCmdXs7tF5ZUtwpNldD~AWzgTIY-AdzkE4FML0W4RYJRXT7w~1Qnz5onsasdZIf27SUcyL1J0I-hug5HoXudlGMHMVhXBfL68bTeaaUTETPQLgYKwGeKSdDqRDAWfCqjgqLVzCnAKBODZh2PIZGvl4Na8qo18vldMjr9oPZg__";

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
  red: "oklch(0.55 0.22 25)",
};

const PIE_COLORS = [
  CHART_COLORS.green,
  CHART_COLORS.red,
  CHART_COLORS.amber,
  CHART_COLORS.teal,
  "#6b7280",
];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg p-3 text-xs" style={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)" }}>
        <p className="text-white/50 mb-1">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: {formatCompact(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Home() {
  const margin = ((overviewKPIs.totalStake - overviewKPIs.totalWinnings) / overviewKPIs.totalStake * 100).toFixed(1);

  return (
    <DashboardLayout title="Executive Overview" subtitle="All bets are on! — Live platform summary">
      {/* Hero banner */}
      <div
        className="relative rounded-xl overflow-hidden mb-6 p-6"
        style={{
          backgroundImage: `url(${HERO_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
          minHeight: "160px",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        <div className="relative z-10">
          <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "oklch(0.72 0.14 85)" }}>
            Playa Bets Analytics
          </div>
          <h2 className="text-2xl font-bold text-white mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>
            Platform Dashboard
          </h2>
          <p className="text-sm text-white/60 max-w-md">
            Real-time operational intelligence across users, betting, finance, and compliance.
            Data sourced from the isbets_bi DWH.
          </p>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "oklch(0.75 0.17 145)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              DWH Connected (Mock)
            </div>
            <div className="text-xs text-white/40">Last refresh: just now</div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Total Users"
          value={formatCompact(overviewKPIs.totalUsers)}
          subtitle={`${formatCompact(overviewKPIs.activeUsers)} active`}
          change={8.4}
          changeLabel="vs last month"
          icon={<Users size={18} />}
          accent="teal"
        />
        <KpiCard
          title="Total Betslips"
          value={formatCompact(overviewKPIs.totalBetslips)}
          subtitle="All time"
          change={12.1}
          changeLabel="vs last month"
          icon={<TrendingUp size={18} />}
          accent="gold"
        />
        <KpiCard
          title="Gross Revenue"
          value={`₦${formatCompact(overviewKPIs.grossRevenue)}`}
          subtitle={`${margin}% margin`}
          change={5.3}
          changeLabel="vs last month"
          icon={<DollarSign size={18} />}
          accent="green"
        />
        <KpiCard
          title="Active Campaigns"
          value={overviewKPIs.activeCampaigns}
          subtitle={`${overviewKPIs.selfExclusions} self-exclusions`}
          change={-2.1}
          changeLabel="vs last month"
          icon={<Gift size={18} />}
          accent="amber"
        />
      </div>

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Total Stake"
          value={`₦${formatCompact(overviewKPIs.totalStake)}`}
          subtitle="All betslips"
          icon={<Zap size={18} />}
          accent="gold"
        />
        <KpiCard
          title="Total Winnings"
          value={`₦${formatCompact(overviewKPIs.totalWinnings)}`}
          subtitle="Paid to players"
          icon={<Activity size={18} />}
          accent="amber"
        />
        <KpiCard
          title="Self-Exclusions"
          value={overviewKPIs.selfExclusions}
          subtitle="Active exclusions"
          change={3.2}
          changeLabel="vs last month"
          icon={<ShieldCheck size={18} />}
          accent="red"
        />
        <KpiCard
          title="Casino Bets"
          value="870K"
          subtitle="All providers"
          change={18.4}
          changeLabel="vs last month"
          icon={<Gamepad2 size={18} />}
          accent="teal"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Revenue trend — 2/3 width */}
        <div
          className="lg:col-span-2 rounded-xl p-5"
          style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                Revenue Trend
              </h3>
              <p className="text-xs text-white/40">Last 30 days — Stake vs Winnings vs Revenue</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={revenueTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="stakeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.gold} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.gold} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.green} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }}
                tickFormatter={(v) => v.slice(5)}
                interval={4}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }}
                tickFormatter={(v) => `₦${formatCompact(v)}`}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="stake" name="Stake" stroke={CHART_COLORS.gold} fill="url(#stakeGrad)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS.green} fill="url(#revenueGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Betslip status pie — 1/3 width */}
        <div
          className="rounded-xl p-5"
          style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Betslip Status
            </h3>
            <p className="text-xs text-white/40">Distribution by status</p>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={betslipsByStatus}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                dataKey="count"
                nameKey="status"
                paddingAngle={2}
              >
                {betslipsByStatus.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => formatCompact(v)}
                contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {betslipsByStatus.map((s, i) => (
              <div key={s.status} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-white/50 truncate">{s.status}</span>
                </div>
                <span className="text-white/70 font-mono text-xs" style={{ fontFamily: "'Space Mono', monospace" }}>
                  {formatCompact(s.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: Top sports + App breakdown + Upcoming events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Top sports bar chart */}
        <div
          className="lg:col-span-2 rounded-xl p-5"
          style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Top Sports by Revenue
            </h3>
            <p className="text-xs text-white/40">Gross revenue by sport type</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topSports.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 70 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }}
                tickFormatter={(v) => `₦${formatCompact(v)}`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="sport"
                tick={{ fill: "oklch(0.65 0.02 0)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip
                formatter={(v: number) => [`₦${formatCompact(v)}`, "Revenue"]}
                contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }}
              />
              <Bar dataKey="revenue" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* App breakdown + User status */}
        <div className="space-y-4">
          {/* Application breakdown */}
          <div
            className="rounded-xl p-4"
            style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}
          >
            <h3 className="text-sm font-semibold text-white mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
              By Platform
            </h3>
            <div className="space-y-2">
              {betsByApplication.map((a) => (
                <div key={a.app}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">{a.app}</span>
                    <span className="text-white/80 font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>
                      {a.percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${a.percentage}%`,
                        background: a.app === "Mobile" ? CHART_COLORS.gold : a.app === "Web Site" ? CHART_COLORS.teal : CHART_COLORS.amber,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User status */}
          <div
            className="rounded-xl p-4"
            style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}
          >
            <h3 className="text-sm font-semibold text-white mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
              User Status
            </h3>
            <div className="space-y-2">
              {usersByStatus.map((u) => (
                <div key={u.status} className="flex items-center justify-between">
                  <StatusBadge status={u.status} dot />
                  <span className="text-white/70 text-xs font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>
                    {formatNumber(u.count)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div
        className="rounded-xl p-5"
        style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Live & Upcoming Events
            </h3>
            <p className="text-xs text-white/40">Events with open bets today</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Event ID", "Sport", "Event", "Start Time", "Status", "Open Bets"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-4 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcomingEvents.map((e) => (
                <tr key={e.eventId} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-4 text-white/40 text-xs font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>
                    #{e.eventId}
                  </td>
                  <td className="py-2.5 pr-4 text-white/60 text-xs">{e.sport}</td>
                  <td className="py-2.5 pr-4 text-white/80 text-sm font-medium">{e.event}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono" style={{ fontFamily: "'Space Mono', monospace" }}>
                    {e.startDate.split(" ")[1]}
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={e.status} dot />
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="text-xs font-mono" style={{ fontFamily: "'Space Mono', monospace", color: "oklch(0.72 0.14 85)" }}>
                      {formatNumber(e.openBets)}
                    </span>
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
