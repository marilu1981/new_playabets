/**
 * PLAYA BETS - Users & Players Page
 * DWH Views: view_Users, view_Balances, view_UserSessions, view_UsersSelfexclusions
 */

import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Users, UserCheck, UserX, Shield, Clock } from "lucide-react";
import {
  overviewKPIs as baseOverviewKPIs,
  usersByStatus as baseUsersByStatus,
  userRegistrations as baseUserRegistrations,
  usersByCurrency as baseUsersByCurrency,
  recentSessions as baseRecentSessions,
  selfExclusionSummary as baseSelfExclusionSummary,
} from "@/lib/mockData";
import { formatNumber, formatCompact } from "@/lib/formatters";
import {
  filterByDateRange,
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleNumber,
} from "@/lib/filterUtils";

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  red: "oklch(0.55 0.22 25)",
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");

type DataMode = "mock" | "partial" | "live";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${path}`);
  }
  return res.json() as Promise<T>;
}

export default function UsersPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [dataMode, setDataMode] = useState<DataMode>("mock");
  const [latestDataDate, setLatestDataDate] = useState<string | null>(null);
  const [liveOverview, setLiveOverview] = useState<typeof baseOverviewKPIs | null>(null);
  const [liveRegistrations, setLiveRegistrations] = useState<typeof baseUserRegistrations | null>(null);

  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const fallbackYear = useMemo(() => {
    const parsedYear = Number.parseInt(filters.dateTo.slice(0, 4), 10);
    return Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();
  }, [filters.dateTo]);

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
    let cancelled = false;

    async function loadLiveData() {
      const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
      const [kpisRes, regsRes] = await Promise.allSettled([
        fetchJson<{ actives?: number; registrations?: number }>(`/kpis?${query}`),
        fetchJson<{ registrations: Array<{ date: string; value: number }> }>(`/timeseries/registrations?${query}`),
      ]);

      if (cancelled) {
        return;
      }

      const hasKpis = kpisRes.status === "fulfilled";
      const hasRegs = regsRes.status === "fulfilled";
      setDataMode(hasKpis && hasRegs ? "live" : hasKpis || hasRegs ? "partial" : "mock");

      if (hasKpis) {
        setLiveOverview({
          ...baseOverviewKPIs,
          totalUsers: Number(kpisRes.value.registrations ?? 0),
          activeUsers: Number(kpisRes.value.actives ?? 0),
        });
      }

      if (hasRegs) {
        const byMonth = new Map<string, { month: string; registrations: number; churned: number }>();
        for (const row of regsRes.value.registrations ?? []) {
          const dt = new Date(`${row.date}T00:00:00Z`);
          if (Number.isNaN(dt.getTime())) {
            continue;
          }
          const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
          const label = `${dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${dt.getUTCFullYear()}`;
          const bucket = byMonth.get(key) ?? { month: label, registrations: 0, churned: 0 };
          bucket.registrations += Number(row.value ?? 0);
          byMonth.set(key, bucket);
        }
        const monthly = Array.from(byMonth.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-12)
          .map(([, v]) => v);
        setLiveRegistrations(monthly);
      }
    }

    loadLiveData().catch(() => {
      if (!cancelled) {
        setDataMode("mock");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filters.dateFrom, filters.dateTo]);

  const usersByStatus = useMemo(
    () => scaleArrayNumericFields(baseUsersByStatus, multiplier, ["status", "statusId"]),
    [multiplier],
  );
  const usersByCurrency = useMemo(
    () => scaleArrayNumericFields(baseUsersByCurrency, multiplier, ["currency", "currencyId"]),
    [multiplier],
  );
  const userRegistrations = useMemo(
    () =>
      scaleArrayNumericFields(
        filterByDateRange(liveRegistrations ?? baseUserRegistrations, filters, (row) => row.month, { fallbackYear }),
        multiplier,
        ["month"],
      ),
    [filters, fallbackYear, multiplier, liveRegistrations],
  );
  const recentSessions = useMemo(
    () => filterByDateRange(baseRecentSessions, filters, (row) => row.loginDate),
    [filters],
  );
  const selfExclusionSummary = useMemo(() => {
    const scaledByPeriod = baseSelfExclusionSummary.byPeriod.map((row) => ({
      ...row,
      count: scaleNumber(row.count, multiplier),
    }));
    const inProgress = scaleNumber(baseSelfExclusionSummary.inProgress, multiplier);
    const pending = scaleNumber(baseSelfExclusionSummary.pending, multiplier);
    const completed = scaleNumber(baseSelfExclusionSummary.completed, multiplier);
    const total = inProgress + pending + completed;
    return {
      ...baseSelfExclusionSummary,
      inProgress,
      pending,
      completed,
      total,
      byPeriod: scaledByPeriod,
    };
  }, [multiplier]);
  const overviewKPIs = useMemo(() => {
    const totalUsers = usersByStatus.reduce((sum, row) => sum + row.count, 0);
    const activeUsers = usersByStatus.find((row) => row.status === "Enabled")?.count ?? 0;
    return {
      ...(liveOverview ?? baseOverviewKPIs),
      totalUsers: liveOverview?.totalUsers ?? totalUsers,
      activeUsers: liveOverview?.activeUsers ?? activeUsers,
    };
  }, [usersByStatus, liveOverview]);
  const totalUsersSafe = Math.max(1, overviewKPIs.totalUsers);
  const frozenUsers = usersByStatus.find((u) => u.status === "Frozen")?.count ?? 0;
  const disabledUsers = usersByStatus.find((u) => u.status === "Disabled")?.count ?? 0;
  const selfExclusionTotalSafe = Math.max(1, selfExclusionSummary.total);

  return (
    <DashboardLayout
      title="Users & Players"
      subtitle="Player lifecycle, sessions, and responsible gaming"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}
    >
      <div className="text-xs text-white/50 mb-3">
        Data mode: {dataMode === "live" ? "Live" : dataMode === "partial" ? "Partial Live" : "Mock"}
        {latestDataDate ? ` · Data through ${latestDataDate}` : ""}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Users" value={formatCompact(overviewKPIs.totalUsers)} subtitle="Registrations in selected range" change={8.4} changeLabel="vs last month" icon={<Users size={18} />} accent="teal" />
        <KpiCard title="Active Users" value={formatCompact(overviewKPIs.activeUsers)} subtitle="Status: Enabled" change={3.2} changeLabel="vs last month" icon={<UserCheck size={18} />} accent="green" />
        <KpiCard title="Frozen / Disabled" value={formatCompact(frozenUsers + disabledUsers)} subtitle="Requires attention" icon={<UserX size={18} />} accent="amber" />
        <KpiCard title="Self-Exclusions" value={selfExclusionSummary.total} subtitle={`${selfExclusionSummary.inProgress} in progress`} change={3.2} changeLabel="vs last month" icon={<Shield size={18} />} accent="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">User Registrations</h3>
          <p className="text-xs text-white/40 mb-4">
            Last 12 months - new vs churned{liveRegistrations ? " (live registrations, churn pending)" : " (mock)"}
          </p>
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

        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Users by Currency</h3>
          <p className="text-xs text-white/40 mb-4">African market distribution - Pending (Mock)</p>
          <div className="space-y-3">
            {usersByCurrency.map((c, i) => {
              const pct = (c.users / totalUsersSafe * 100).toFixed(1);
              const colors = [CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.green, CHART_COLORS.red, "oklch(0.72 0.17 60)"];
              return (
                <div key={c.currency}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white/60">{c.currency}</span>
                    <span className="text-white/80 font-medium">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-4">User Status Breakdown - Pending (Mock)</h3>
          <div className="space-y-3">
            {usersByStatus.map((u) => {
              const pct = (u.count / totalUsersSafe * 100).toFixed(1);
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
                  <span className="text-xs text-white/60 font-medium w-16 text-right">
                    {formatNumber(u.count)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Self-Exclusion Summary</h3>
          <p className="text-xs text-white/40 mb-4">Responsible gaming overview - Pending (Mock)</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "In Progress", value: selfExclusionSummary.inProgress, color: CHART_COLORS.gold },
              { label: "Pending", value: selfExclusionSummary.pending, color: "oklch(0.72 0.17 60)" },
              { label: "Completed", value: selfExclusionSummary.completed, color: CHART_COLORS.green },
            ].map((s) => (
              <div key={s.label} className="text-center p-3 rounded-lg" style={{ background: "oklch(0.22 0.04 155)" }}>
                <div className="text-xl font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
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
                    <div className="h-full rounded-full" style={{ width: `${(p.count / selfExclusionTotalSafe) * 100}%`, background: CHART_COLORS.red }} />
                  </div>
                  <span className="text-white/60 w-6 text-right font-medium">{p.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} style={{ color: "oklch(0.72 0.14 85)" }} />
          <h3 className="text-sm font-semibold text-white">Recent Sessions - Pending (Mock)</h3>
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
                  <td className="py-2.5 pr-4 text-white/40 text-xs font-medium">#{s.sessionId}</td>
                  <td className="py-2.5 pr-4 text-white/40 text-xs font-medium">{s.userId}</td>
                  <td className="py-2.5 pr-4 text-white/80 text-sm">{s.username}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs">{s.loginDate.split(" ")[1]}</td>
                  <td className="py-2.5 pr-4 text-white/40 text-xs">{s.ip}</td>
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
