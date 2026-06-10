/**
 * PLAYA BETS - Players Breakdown Page
 * DWH Views: view_Users, view_Balances, view_UserSessions, view_UsersSelfexclusions
 */

import { useEffect, useMemo, useState } from "react";
import { cachedFetch, getLatestDataDate, setLatestDataDate as persistLatestDate } from "@/lib/apiCache";
import DashboardLayout from "@/components/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import MockOverlay from "@/components/MockOverlay";
import DataTable from "@/components/DataTable";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Users, UserCheck, UserX, Shield, Clock } from "lucide-react";
import {
  overviewKPIs as baseOverviewKPIs,
  usersByStatus as baseUsersByStatus,
  userRegistrations as baseUserRegistrations,
  selfExclusionSummary as baseSelfExclusionSummary,
  selfExclusionTrend as baseSelfExclusionTrend,
} from "@/lib/mockData";
import { formatCompact, formatFull, formatNumber } from "@/lib/formatters";
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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");


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

  type VipRow = {
    user_id: string;
    account_manager: string;
    vip_lifecycle_stage: string;
    onboard_date?: string | null;
    offboard_date?: string | null;
  };

  type VipSummary = {
    has_data: boolean;
    total: number;
    active_now: number;
    with_onboard_date: number;
    by_stage: Array<{ stage: string; count: number }>;
    by_account_manager: Array<{ account_manager: string; count: number }>;
  };

export default function UsersPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [latestDataDate, setLatestDataDate] = useState<string | null>(getLatestDataDate());
  // If we already have a cached date the data fetch fires immediately — start non-loading
  // so returning to this page feels instant. On first load it starts as true.
  const [isLoading, setIsLoading] = useState<boolean>(getLatestDataDate() === null);
  const [liveOverview, setLiveOverview] = useState<typeof baseOverviewKPIs | null>(null);
  const [liveApd, setLiveApd] = useState<number | null>(null);
  const [liveRegistrationsDaily, setLiveRegistrationsDaily] = useState<Array<{ date: string; value: number }> | null>(null);
  const [liveDailyActives, setLiveDailyActives] = useState<Array<{ date: string; actives: number }> | null>(null);
  const [liveStatusBreakdown, setLiveStatusBreakdown] = useState<Array<{ status: string; count: number }> | null>(null);
  const [liveSelfExclusions, setLiveSelfExclusions] = useState<{
    total: number; inProgress: number; pending: number; completed: number;
    byPeriod: Array<{ period: string; count: number }>;
  } | null>(null);
  const [vipSummary, setVipSummary] = useState<VipSummary | null>(null);
  const [vipRows, setVipRows] = useState<VipRow[] | null>(null);
  const [vipManagerFilter, setVipManagerFilter] = useState<string>("all");

  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const fallbackYear = useMemo(() => {
    const parsedYear = Number.parseInt(filters.dateTo.slice(0, 4), 10);
    return Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();
  }, [filters.dateTo]);
  const granularityLabel = useMemo(() => {
    const value = filters.granularity ?? "daily";
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }, [filters.granularity]);
  const resetFilters = useMemo(() => {
    if (!latestDataDate || !/^\d{4}-\d{2}-\d{2}$/.test(latestDataDate)) {
      return defaultFilters;
    }
    const dateTo = latestDataDate;
    const dateFrom = `${dateTo.slice(0, 7)}-01`;
    return { ...defaultFilters, dateFrom, dateTo };
  }, [latestDataDate]);

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
    if (latestDataDate === null) {
      return;
    }

    let cancelled = false;

    async function loadLiveData() {
      const params = new URLSearchParams({
        start: filters.dateFrom,
        end: filters.dateTo,
      });
      if (filters.territory !== "all") params.set("territory", filters.territory);
      if (filters.country !== "all") params.set("country", filters.country);
      if (filters.currentSegment !== "all") params.set("current_segment", filters.currentSegment);
      if (filters.granularity) params.set("granularity", filters.granularity);
      const query = params.toString();
      const [kpisRes, regsRes, statusRes, dailyRes, casinoRes, selfExRes, selfExTrendRes] = await Promise.allSettled([
        fetchJson<{ actives_sports?: number; actives_casino?: number; registrations?: number; total_apd?: number }>(`/kpis?${query}`),
        fetchJson<{ registrations: Array<{ date: string; value: number }> }>(`/timeseries/registrations?${query}`),
        fetchJson<{ statuses?: Array<{ status: string; count: number }> }>(`/users/status-breakdown?${query}`),
        fetchJson<{ rows: Array<{ date: string; actives_sports?: number }> }>(`/kpis/daily?${query}&metrics=actives_sports`),
        fetchJson<{ points: Array<{ date: string; casino_actives?: number; actives?: number }> }>(`/casino/daily?${query}`),
        fetchJson<{ total: number; inProgress: number; pending: number; completed: number; byPeriod: Array<{ period: string; count: number }>; has_data?: boolean }>(`/users/self-exclusions`),
      ]);

      if (cancelled) {
        return;
      }

      const hasKpis = kpisRes.status === "fulfilled";
      const hasRegs = regsRes.status === "fulfilled";
      setIsLoading(false);

      if (hasKpis) {
        setLiveOverview({
          ...baseOverviewKPIs,
          totalUsers: Number(kpisRes.value.registrations ?? 0),
          activesSports: Number(kpisRes.value.actives_sports ?? 0),
          activesCasino: Number(kpisRes.value.actives_casino ?? 0),
        });
        const apd = Number(kpisRes.value.total_apd ?? 0);
        setLiveApd(apd > 0 ? apd : null);
      }

      if (hasRegs) {
        setLiveRegistrationsDaily((regsRes.value.registrations ?? []).map((r) => ({
          date: r.date,
          // API returns { date, registrations } — fall back to .value for compatibility
          value: Number((r as { date: string; registrations?: number; value?: number }).registrations ?? (r as { date: string; registrations?: number; value?: number }).value ?? 0),
        })));
      } else {
        setLiveRegistrationsDaily(null);
      }

      if (statusRes.status === "fulfilled") {
        const payload = statusRes.value;
        const statuses = Array.isArray(payload)
          ? payload
          : payload.statuses ?? [];
        setLiveStatusBreakdown(statuses);
      } else {
        setLiveStatusBreakdown(null);
      }

      if (selfExRes.status === "fulfilled" && selfExRes.value.has_data !== false) {
        setLiveSelfExclusions(selfExRes.value);
      } else {
        setLiveSelfExclusions(null);
      }

      if (dailyRes.status === "fulfilled" || casinoRes.status === "fulfilled") {
        const sportsbookRows = dailyRes.status === "fulfilled" ? dailyRes.value.rows ?? [] : [];
        const casinoRows = casinoRes.status === "fulfilled" ? casinoRes.value.points ?? [] : [];
        const byDate = new Map<string, number>();
        for (const row of sportsbookRows) {
          byDate.set(row.date, Number(row.actives_sports ?? 0));
        }
        for (const row of casinoRows) {
          const prev = byDate.get(row.date) ?? 0;
          byDate.set(row.date, prev + Number(row.casino_actives ?? row.actives ?? 0));
        }
        const merged = Array.from(byDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, actives]) => ({ date, actives }));
        setLiveDailyActives(merged);
      } else {
        setLiveDailyActives(null);
      }
    }

    loadLiveData().catch(() => {
      if (!cancelled) {
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

  useEffect(() => {
    let cancelled = false;

    async function loadVipData() {
      const params = new URLSearchParams();
      if (vipManagerFilter !== "all") {
        params.set("account_manager", vipManagerFilter);
      }
      const query = params.toString();
      const [summaryRes, listRes] = await Promise.allSettled([
        fetchJson<VipSummary>("/vip/summary"),
        fetchJson<{ rows: VipRow[] }>(`/vip/list${query ? `?${query}` : ""}`),
      ]);

      if (cancelled) {
        return;
      }

      if (summaryRes.status === "fulfilled") {
        setVipSummary(summaryRes.value);
      } else {
        setVipSummary(null);
      }

      if (listRes.status === "fulfilled") {
        setVipRows(listRes.value.rows ?? []);
      } else {
        setVipRows(null);
      }
    }

    loadVipData().catch(() => {
      if (!cancelled) {
        setVipSummary(null);
        setVipRows(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [vipManagerFilter]);

  const statusSource = liveStatusBreakdown ?? baseUsersByStatus;
  const statusMultiplier = liveStatusBreakdown ? 1 : multiplier;
  const usersByStatus = useMemo(
    () => scaleArrayNumericFields(statusSource, statusMultiplier, ["status", "statusId"]),
    [statusSource, statusMultiplier],
  );

  const registrationsTrend = useMemo(() => {
    const source = liveRegistrationsDaily
      ? liveRegistrationsDaily.map((row) => ({ date: row.date, value: row.value }))
      : baseUserRegistrations.map((row) => ({ date: row.month, value: row.registrations }));
    const filtered = filterByDateRange(source, filters, (row) => row.date, { fallbackYear });
    return aggregateByGranularity(filtered, filters.granularity ?? "daily", (row) => row.date, { fallbackYear });
  }, [filters, fallbackYear, liveRegistrationsDaily]);
  const dailyActivesTrend = useMemo(
    () => {
      if (!liveDailyActives) {
        return [];
      }
      const filtered = filterByDateRange(liveDailyActives, filters, (row) => row.date, { fallbackYear });
      return aggregateByGranularity(filtered, filters.granularity ?? "daily", (row) => row.date, { fallbackYear });
    },
    [filters, fallbackYear, liveDailyActives],
  );
  const selfExclusionSummary = useMemo(() => {
    if (liveSelfExclusions) {
      return liveSelfExclusions;
    }
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
  }, [liveSelfExclusions, multiplier]);
  const overviewKPIs = useMemo(() => {
    const totalUsers = usersByStatus.reduce((sum, row) => sum + row.count, 0);
    const activeUsers = usersByStatus.find((row) => row.status === "Enabled")?.count ?? 0;
    return {
      ...(liveOverview ?? baseOverviewKPIs),
      totalUsers: liveOverview?.totalUsers ?? totalUsers,
      activeUsers,
      activesSports: liveOverview?.activesSports ?? 0,
      activesCasino: liveOverview?.activesCasino ?? 0,
    };
  }, [usersByStatus, liveOverview]);
  const totalUsersSafe = Math.max(1, overviewKPIs.totalUsers);
  const frozenUsers = usersByStatus.find((u) => u.status === "Frozen")?.count ?? 0;
  const pendingKycUsers = usersByStatus.find((u) => u.status === "Be Validated")?.count ?? 0;
  const vipTableRows = vipRows ?? [];
  const vipManagerOptions = useMemo(() => {
    const managers = vipSummary?.by_account_manager?.map((row) => row.account_manager) ?? [];
    return Array.from(new Set(managers)).sort((a, b) => a.localeCompare(b));
  }, [vipSummary]);

  return (
    <DashboardLayout
      title="Players Breakdown"
      subtitle="Player lifecycle, sessions, and responsible gaming"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} resetFilters={resetFilters} />}
    >

      <div className="rounded-xl p-5 mb-6" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard title="Registrations" value={formatFull(overviewKPIs.totalUsers)} subtitle="Total registrations in selected range" icon={<Users size={18} />} accent="teal" loading={isLoading} />
          <KpiCard title="Active Users" value={formatFull(overviewKPIs.activeUsers)} subtitle="Status: Enabled" icon={<UserCheck size={18} />} accent="green" loading={isLoading} />
          <KpiCard title="Frozen Accounts" value={formatFull(frozenUsers)} subtitle="Status: Frozen" icon={<UserX size={18} />} accent="amber" loading={isLoading} />
          <KpiCard title="Pending KYC" value={formatFull(pendingKycUsers)} subtitle="Status: Be Validated" icon={<Clock size={18} />} accent="gold" loading={isLoading} />
          <KpiCard title="Self-Exclusions" value={liveSelfExclusions ? formatFull(selfExclusionSummary.total) : "Pending"} valueClassName={!liveSelfExclusions ? "text-white/30" : undefined} subtitle="Active self-exclusions" icon={<Shield size={18} />} accent="red" loading={isLoading} />
          <KpiCard title="APD" value={liveApd != null ? `${liveApd}d` : "—"} subtitle="Avg play days / active player" icon={<UserCheck size={18} />} accent="green" loading={isLoading} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="relative rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <MockOverlay active={!liveRegistrationsDaily} description="Registrations trend loading..." />
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Registrations Trend</h3>
          <p className="text-xs text-gray-400 mb-4">{granularityLabel} registrations over time</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={registrationsTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={45} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e4ece4", fontSize: 11 }} />
              <Bar dataKey="value" name="Registrations" fill={CHART_COLORS.teal} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="relative rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <MockOverlay active={!liveDailyActives} description="Daily actives pending live data" />
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Daily Active Users</h3>
          <p className="text-xs text-gray-400 mb-4">{granularityLabel} active users (Sports + Casino)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyActivesTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={45} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e4ece4", fontSize: 11 }} />
              <Bar dataKey="actives" name="Daily Actives" fill={CHART_COLORS.green} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>


      <div className="mb-6">
        <div className="relative rounded-xl p-5 mb-4" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <MockOverlay active={!liveStatusBreakdown} badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-gray-800 mb-2">User Status Breakdown</h3>
          <p className="text-xs text-gray-400 mb-4">Derived from the latest `userstatus` field export.</p>
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
                  <span className="text-xs text-gray-600 font-medium w-16 text-right">
                    {formatNumber(u.count)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <MockOverlay active={!vipSummary} badge label="VIP CSV" />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">VIP Snapshot</h3>
              <p className="text-xs text-gray-400">Root-level CSV snapshot with user, manager, lifecycle stage, and onboard date.</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500" htmlFor="vip-manager-filter">Account manager</label>
              <select
                id="vip-manager-filter"
                value={vipManagerFilter}
                onChange={(e) => setVipManagerFilter(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All managers</option>
                {vipManagerOptions.map((manager) => (
                  <option key={manager} value={manager}>{manager}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg border border-gray-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700/70">VIP users</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{vipSummary ? formatFull(vipSummary.total) : "—"}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700/70">Hosted VIP</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{vipSummary ? formatFull(vipSummary.active_now) : "—"}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700/70">With onboard date</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{vipSummary ? formatFull(vipSummary.with_onboard_date) : "—"}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700/70">Managers</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-900">{vipSummary ? formatFull(vipSummary.by_account_manager.length) : "—"}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-200 p-4 xl:col-span-1">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">By lifecycle stage</h4>
              <div className="space-y-3">
                {(vipSummary?.by_stage ?? []).map((row) => {
                  const pct = vipSummary && vipSummary.total > 0 ? (row.count / vipSummary.total) * 100 : 0;
                  return (
                    <div key={row.stage}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-600">{row.stage}</span>
                        <span className="font-medium text-gray-800">{formatNumber(row.count)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CHART_COLORS.teal }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4 xl:col-span-2">
              <h4 className="text-sm font-semibold text-gray-800 mb-3">VIP roster</h4>
              <DataTable<VipRow>
                compact
                className="border-gray-200"
                emptyMessage={vipSummary ? "No VIP rows match the selected manager." : "VIP data is not available yet."}
                columns={[
                  { key: "user_id", header: "User ID", mono: true },
                  { key: "account_manager", header: "Account Manager" },
                  { key: "vip_lifecycle_stage", header: "Lifecycle Stage" },
                  {
                    key: "onboard_date",
                    header: "Onboard Date",
                    render: (row) => row.onboard_date ?? "—",
                  },
                ]}
                data={vipTableRows}
              />
            </div>
          </div>
        </div>
      </div>

    </DashboardLayout>
  );
}
