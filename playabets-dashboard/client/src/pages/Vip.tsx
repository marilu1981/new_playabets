import { useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import { usePersistedFilters } from "@/lib/usePersistedFilters";
import { aggregateByGranularity } from "@/pages/home/homeUtils";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Crown, Upload, Users, Wallet, Gift, Percent, TrendingUp, DollarSign } from "lucide-react";
import { cachedFetch, invalidateCache } from "@/lib/apiCache";
import { formatFull, formatNumber, formatCompact } from "@/lib/formatters";
import AiInsightsPanel from "@/components/AiInsightsPanel";
import type { AiInsights } from "@/lib/generateReport";
import { getCachedInsights, setCachedInsights } from "@/lib/insightsCache";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 20000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Request timed out")), timeoutMs)),
  ]);
}

const CARD = { background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" } as const;
const TT_STYLE = { background: "#fff", border: "1px solid #e4ece4", borderRadius: 8, fontSize: 11 } as const;
const fmtZar = (v: number) => `R ${formatFull(Math.round(v))}`;

type VipSummary = {
  has_data: boolean;
  total: number;
  stints: number;
  active_now: number;
  active_as_of_end: number;
  onboarded_in_period: number;
  offboarded_in_period: number;
  with_onboard_date: number;
  date_errors: number;
  by_stage: Array<{ stage: string; count: number }>;
  by_account_manager: Array<{ account_manager: string; count: number }>;
  account_managers: string[];
  stages: string[];
};

type VipRevenue = {
  has_data: boolean;
  vip_count?: number;
  active_vips?: number;
  total_turnover?: number;
  total_ggr?: number;
  apd?: number;
  avg_revenue_per_vip?: number;
  vip_conversion_rate?: number;
  total_players?: number;
  sports_share?: number;
  casino_share?: number;
};

type ManagerRow = {
  account_manager: string;
  vip_count: number;
  turnover: number;
  ggr: number;
  avg_revenue_per_vip: number;
  sports_share: number;
  casino_share: number;
};

type TopPlayer = {
  user_id: string | null;
  account_manager: string;
  vip_lifecycle_stage: string;
  turnover: number;
  ggr: number;
  bets: number;
};

type ProductShare = {
  has_data: boolean;
  products: Array<{ product: string; stake: number; ggr: number }>;
};

type Demographics = {
  has_data: boolean;
  age_bands: Array<{ band: string; count: number }>;
  countries: Array<{ country: string; count: number }>;
  gender_available?: boolean;
};

type TrendPoint   = { date: string; turnover: number; ggr: number; margin: number; bets: number };
type MonthPoint   = { month: string; turnover: number; ggr: number; margin: number; bets: number; active_vips: number };
type HourPoint    = { hour: number; label: string; bets: number; sports_bets: number; casino_bets: number; turnover: number };

const PRODUCT_COLORS: Record<string, string> = { Sports: "#7ab800", Casino: "#ffb500" };
const CHART_COLORS = { ggr: "#7ab800", turnover: "#3b82f6", margin: "#ffb500", sports: "#7ab800", casino: "#ffb500" };

export default function VipPage() {
  const vipDefaultFilters = defaultFilters;
  const [filters, setFilters] = usePersistedFilters();
  const [manager, setManager] = useState<string>("all");
  const [stage, setStage] = useState<string>("all");
  const [currentOnly, setCurrentOnly] = useState<boolean>(false);
  const [summary, setSummary] = useState<VipSummary | null>(null);
  const [revenue, setRevenue] = useState<VipRevenue | null>(null);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);
  const [productShare, setProductShare] = useState<ProductShare | null>(null);
  const [demographics, setDemographics] = useState<Demographics | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [monthly, setMonthly] = useState<MonthPoint[]>([]);
  const [hourly, setHourly] = useState<HourPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  type UploadStatus = { ok: boolean; added: number; updated: number; unchanged: number; total_in_roster: number; filename: string } | null;
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadStatus>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    const apiKey = (import.meta.env.VITE_API_KEY as string | undefined) ?? "";
    try {
      const res = await fetch(`${API_BASE_URL}/vip/upload`, {
        method: "POST",
        headers: apiKey ? { "X-API-Key": apiKey } : {},
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? `HTTP ${res.status}`);
      setUploadResult(json);
      invalidateCache();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const query = useMemo(() => {
    const params = new URLSearchParams({ start: filters.dateFrom, end: filters.dateTo });
    if (manager !== "all") params.set("account_manager", manager);
    if (stage !== "all") params.set("stage", stage);
    if (currentOnly) params.set("current_only", "true");
    return params.toString();
  }, [filters.dateFrom, filters.dateTo, manager, stage, currentOnly]);

  const [debouncedQuery, setDebouncedQuery] = useState<string>(query);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const firstPaint = summary === null && revenue === null;
      if (firstPaint) setLoading(true);
      else setRefreshing(true);
      try {
        const [summaryRes, revenueRes] = await Promise.allSettled([
          withTimeout(fetchJson<VipSummary>(`/vip/summary?${debouncedQuery}`), 12000),
          withTimeout(fetchJson<VipRevenue>(`/vip/revenue?${debouncedQuery}`), 12000),
        ]);
        if (cancelled) return;
        setSummary(summaryRes.status === "fulfilled" ? summaryRes.value : null);
        const rev = revenueRes.status === "fulfilled" ? revenueRes.value : null;
        setRevenue(rev);

        setManagers([]);
        setTopPlayers([]);
        setProductShare(null);
        setDemographics({ has_data: false, age_bands: [], countries: [], gender_available: false });
        setTrends([]);
        setMonthly([]);
        setHourly([]);

        // Load detail sections asynchronously so they never block first paint.
        withTimeout(fetchJson<{ managers: ManagerRow[] }>(`/vip/by-manager?${debouncedQuery}`), 15000)
          .then((d) => { if (!cancelled) setManagers(d?.managers ?? []); })
          .catch(() => { if (!cancelled) setManagers([]); });

        withTimeout(fetchJson<{ players: TopPlayer[] }>(`/vip/top-players?${debouncedQuery}&limit=20`), 15000)
          .then((d) => { if (!cancelled) setTopPlayers(d?.players ?? []); })
          .catch(() => { if (!cancelled) setTopPlayers([]); });

        withTimeout(fetchJson<ProductShare>(`/vip/product-share?${debouncedQuery}`), 15000)
          .then((d) => { if (!cancelled) setProductShare(d ?? null); })
          .catch(() => { if (!cancelled) setProductShare(null); });

        withTimeout(fetchJson<Demographics>(`/vip/demographics?${debouncedQuery}`), 15000)
          .then((d) => { if (!cancelled) setDemographics(d ?? null); })
          .catch(() => { if (!cancelled) setDemographics((prev) => prev ?? { has_data: false, age_bands: [], countries: [], gender_available: false }); });

        fetchJson<{ has_data: boolean; points: TrendPoint[] }>(`/vip/trends?${debouncedQuery}`)
          .then((d) => { if (!cancelled) setTrends(d?.points ?? []); })
          .catch(() => { if (!cancelled) setTrends([]); });

        fetchJson<{ has_data: boolean; months: MonthPoint[] }>(`/vip/monthly?${debouncedQuery}`)
          .then((d) => { if (!cancelled) setMonthly(d?.months ?? []); })
          .catch(() => { if (!cancelled) setMonthly([]); });

        fetchJson<{ has_data: boolean; hours: HourPoint[] }>(`/vip/hourly?${debouncedQuery}`)
          .then((d) => { if (!cancelled) setHourly(d?.hours ?? []); })
          .catch(() => { if (!cancelled) setHourly([]); });
      } catch {
        if (cancelled) return;
        setSummary(null);
        setRevenue(null);
        setManagers([]);
        setTopPlayers([]);
        setProductShare(null);
        setDemographics(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    load().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  // VIP AI Insights — fires once revenue data is loaded, cached per period
  useEffect(() => {
    if (!revenue?.has_data) return;
    const rev = revenue;
    const vipGgr = Math.round(rev.total_ggr ?? 0);
    const vipCount = rev.vip_count ?? 0;

    // Return cached insights if available
    const cached = getCachedInsights("vip", filters.dateFrom, filters.dateTo, vipGgr, vipCount);
    if (cached) { setAiInsights(cached); return; }

    const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
    const API_KEY_H = (import.meta.env.VITE_API_KEY as string | undefined) ?? "";
    const holdPct = rev.total_turnover ? (vipGgr / rev.total_turnover * 100) : 0;
    const params = new URLSearchParams({
      start: filters.dateFrom, end: filters.dateTo,
      registrations:   String(vipCount),
      ftds:            String(rev.active_vips ?? 0),
      conv_rate:       String(rev.vip_conversion_rate ?? 0),
      ggr:             String(vipGgr),
      ngr:             String(vipGgr),
      turnover:        String(Math.round(rev.total_turnover ?? 0)),
      hold_pct:        String(holdPct.toFixed(1)),
      total_vips:      String(vipCount),
      vip_ggr:         String(vipGgr),
      active_players:  String(rev.active_vips ?? 0),
      avg_ftd_value:   String(Math.round(rev.avg_revenue_per_vip ?? 0)),
    });
    setAiLoading(true);
    fetch(`${API_BASE}/insights/ai-summary?${params}`, {
      method: "POST",
      headers: { "Accept": "application/json", ...(API_KEY_H ? { "X-API-Key": API_KEY_H } : {}) },
    })
      .then(r => r.json())
      .then(d => {
        if (d.available) {
          setAiInsights(d as AiInsights);
          setCachedInsights("vip", filters.dateFrom, filters.dateTo, d as AiInsights, vipGgr, vipCount);
        }
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dateFrom, filters.dateTo, revenue?.total_ggr, revenue?.vip_count]);

  const managerOptions = summary?.account_managers ?? [];
  const stageOptions = summary?.stages ?? [];
  const rev = revenue?.has_data ? revenue : null;
  const productPieData = (productShare?.products ?? []).map((p) => ({ name: p.product, value: p.stake }));

  // Aggregate trend charts by selected granularity
  const aggregatedTrends = useMemo(() => {
    if (!trends.length || filters.granularity === "daily") return trends;
    return aggregateByGranularity(
      trends as unknown as Record<string, unknown>[],
      filters.granularity,
      (r) => r["date"] as string,
      { avgFields: ["margin"] }
    ) as unknown as TrendPoint[];
  }, [trends, filters.granularity]);

  const xTickFormatter = (v: string) =>
    filters.granularity === "monthly" ? v.slice(0, 7) : v.slice(5);
  const xInterval = filters.granularity === "daily"
    ? Math.max(0, Math.floor(aggregatedTrends.length / 8))
    : 0;

  return (
    <DashboardLayout
      title="VIP Portfolio"
      subtitle="VIP revenue, portfolio-manager performance, and top players"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} resetFilters={vipDefaultFilters} />}
    >
      {/* VIP CSV Upload */}
      <div className="rounded-xl p-5 mb-4" style={CARD}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Upload size={15} className="text-gray-400" />
            Update VIP Roster
          </div>
          <label
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : "hover:opacity-90"}`}
            style={{ background: "#7ab800", color: "#fff" }}
          >
            {uploading ? "Uploading…" : "Choose CSV"}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
          </label>
          <span className="text-xs text-gray-400">Columns: User ID, Account Manager, VIP Lifecycle Stage, Onboard Date, Offboard Date</span>
          {uploadResult && (
            <div className="flex items-center gap-3 text-xs rounded-md px-3 py-2" style={{ background: "#f0f7e6", border: "1px solid #c6e49a" }}>
              <span className="font-semibold text-green-800">{uploadResult.filename}</span>
              <span className="text-green-700">+{uploadResult.added} added</span>
              <span className="text-amber-700">{uploadResult.updated} updated</span>
              <span className="text-gray-500">{uploadResult.unchanged} unchanged</span>
              <span className="text-gray-500">· {uploadResult.total_in_roster.toLocaleString()} total in roster</span>
            </div>
          )}
          {uploadError && (
            <div className="text-xs rounded-md px-3 py-2 text-red-700" style={{ background: "#fef2f2", border: "1px solid #fca5a5" }}>
              {uploadError}
            </div>
          )}
        </div>
      </div>

      {/* Filters + lifecycle summary cards */}
      <div className="rounded-xl p-5 mb-4" style={CARD}>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Account Manager</label>
            <select value={manager} onChange={(e) => setManager(e.target.value)} className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm">
              <option value="all">All managers</option>
              {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Lifecycle Stage</label>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm">
              <option value="all">All stages</option>
              {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700 ml-1 mb-1">
            <input type="checkbox" checked={currentOnly} onChange={(e) => setCurrentOnly(e.target.checked)} />
            Only currently active (as of Date To)
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard title="VIP Users" value={summary ? formatFull(summary.total) : "—"} subtitle="Distinct users in period" icon={<Users size={18} />} accent="teal" loading={loading} />
          <KpiCard title="Active VIP" value={summary ? formatFull(summary.active_as_of_end) : "—"} subtitle="Active as of end date" icon={<Crown size={18} />} accent="gold" loading={loading} />
          <KpiCard title="Onboarded" value={summary ? formatFull(summary.onboarded_in_period) : "—"} subtitle="Users onboarded in period" icon={<Users size={18} />} accent="green" loading={loading} />
          <KpiCard title="Offboarded" value={summary ? formatFull(summary.offboarded_in_period) : "—"} subtitle="Users offboarded in period" icon={<Users size={18} />} accent="amber" loading={loading} />
          <KpiCard title="VIP Stints" value={summary ? formatFull(summary.stints) : "—"} subtitle="Lifecycle stint rows" icon={<Wallet size={18} />} accent="teal" loading={loading} />
          <KpiCard title="Date Errors" value={summary ? formatFull(summary.date_errors) : "—"} subtitle="Offboard before onboard" icon={<Gift size={18} />} accent="red" loading={loading} />
        </div>
      </div>

      {/* VIP Revenue KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        <KpiCard title="VIP Conversion" value={rev ? `${rev.vip_conversion_rate?.toFixed(2)}%` : "—"} subtitle="VIPs / total players" tooltip="VIP Conversion Rate = Total VIPs / Total Players x 100. What percentage of the player base holds VIP status." icon={<Percent size={18} />} accent="teal" loading={loading} />
        <KpiCard title="APD" value={rev ? fmtZar(rev.apd ?? 0) : "—"} subtitle="VIP GGR / days" tooltip="Average Per Day = Total VIP GGR / Number of days in period. Daily revenue contribution from VIP players." icon={<TrendingUp size={18} />} accent="green" loading={loading} />
        <KpiCard title="Avg Revenue / VIP" value={rev ? fmtZar(rev.avg_revenue_per_vip ?? 0) : "—"} subtitle="GGR / VIP count" tooltip="Average Revenue Per VIP = Total VIP GGR / Number of active VIPs. Measures individual VIP player value." icon={<DollarSign size={18} />} accent="gold" loading={loading} />
        <KpiCard title="VIP Turnover" value={rev ? fmtZar(rev.total_turnover ?? 0) : "—"} subtitle="Selected period" tooltip="Total amount staked by VIP players (Sports + Casino) during the selected period." icon={<Wallet size={18} />} accent="teal" loading={loading} />
        <KpiCard title="VIP GGR" value={rev ? fmtZar(rev.total_ggr ?? 0) : "—"} subtitle="Selected period" tooltip="Gross Gaming Revenue from VIP players = VIP Stakes - VIP Payouts (Sports + Casino) for the selected period." icon={<DollarSign size={18} />} accent="green" loading={loading} />
      </div>

      <p className="text-[11px] text-gray-400 mb-4">
        VIP revenue figures (turnover, GGR, APD, top players) are computed from actual betslip and
        casino wagering for the selected period. "VIP tier" uses lifecycle stage
        (Hosted / Unhosted / Time-Out / Self Excluded).
      </p>
      {refreshing && (
        <p className="text-[11px] text-amber-600 mb-4">Updating VIP data for new filters…</p>
      )}

      {/* VIP AI Insights — directly below KPI cards */}
      <AiInsightsPanel insights={aiInsights} loading={aiLoading} title="VIP Insights" />

      {/* By stage + Product share */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl p-5" style={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">By lifecycle stage</h3>
          <div className="space-y-3">
            {(summary?.by_stage ?? []).map((row) => {
              const pct = summary && summary.total > 0 ? (row.count / summary.total) * 100 : 0;
              return (
                <div key={row.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">{row.stage}</span>
                    <span className="font-medium text-gray-800">{formatNumber(row.count)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "oklch(0.65 0.15 195)" }} />
                  </div>
                </div>
              );
            })}
            {(!summary || summary.by_stage.length === 0) && (
              <div className="text-xs text-gray-400">No stage data for selected filters.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl p-5" style={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">VIP Product Share</h3>
          <p className="text-xs text-gray-500 mb-3">Sports vs Casino turnover</p>
          {productPieData.length > 0 && productPieData.some((p) => p.value > 0) ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={productPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" nameKey="name" paddingAngle={2}>
                  {productPieData.map((p) => <Cell key={p.name} fill={PRODUCT_COLORS[p.name] ?? "#999"} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => fmtZar(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-gray-400 py-10 text-center">{loading ? "Loading…" : "No product data."}</div>
          )}
        </div>

        <div className="rounded-xl p-5" style={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Revenue split</h3>
          {rev ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Sports share</span>
                <span className="font-medium text-gray-900">{rev.sports_share?.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${rev.sports_share ?? 0}%`, background: PRODUCT_COLORS.Sports }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Casino share</span>
                <span className="font-medium text-gray-900">{rev.casino_share?.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${rev.casino_share ?? 0}%`, background: PRODUCT_COLORS.Casino }} />
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">{loading ? "Loading…" : "No revenue data."}</div>
          )}
        </div>
      </div>

      {/* VIP Demographics */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl p-5" style={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">VIP Age Distribution</h3>
          <p className="text-xs text-gray-500 mb-3">Active VIPs by age band (from date of birth)</p>
          <div className="space-y-3">
            {(demographics?.age_bands ?? []).map((row) => {
              const total = (demographics?.age_bands ?? []).reduce((s, r) => s + r.count, 0);
              const pct = total > 0 ? (row.count / total) * 100 : 0;
              return (
                <div key={row.band}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">{row.band}</span>
                    <span className="font-medium text-gray-800">{formatNumber(row.count)} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#7ab800" }} />
                  </div>
                </div>
              );
            })}
            {(!demographics?.age_bands || demographics.age_bands.length === 0) && (
              <div className="text-xs text-gray-400">{loading ? "Loading…" : "No age data available."}</div>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">Gender breakdown is not available in the source data.</p>
        </div>

        <div className="rounded-xl p-5" style={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">VIP by Country</h3>
          <p className="text-xs text-gray-500 mb-3">Top countries by active VIP count</p>
          <div className="space-y-3">
            {(demographics?.countries ?? []).map((row) => {
              const total = (demographics?.countries ?? []).reduce((s, r) => s + r.count, 0);
              const pct = total > 0 ? (row.count / total) * 100 : 0;
              return (
                <div key={row.country}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">{row.country}</span>
                    <span className="font-medium text-gray-800">{formatNumber(row.count)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#0d8f8f" }} />
                  </div>
                </div>
              );
            })}
            {(!demographics?.countries || demographics.countries.length === 0) && (
              <div className="text-xs text-gray-400">{loading ? "Loading…" : "No country data available."}</div>
            )}
          </div>
        </div>
      </div>

      {/* Portfolio Manager table */}
      <div className="rounded-xl p-5 mb-4" style={CARD}>
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Portfolio Manager Performance</h3>
        <DataTable<ManagerRow>
          light
          compact
          emptyMessage={loading ? "Loading…" : "No manager data."}
          columns={[
            { key: "account_manager", header: "Manager" },
            { key: "vip_count", header: "VIPs", align: "right", render: (r) => formatFull(r.vip_count) },
            { key: "turnover", header: "Turnover", align: "right", render: (r) => fmtZar(r.turnover) },
            { key: "ggr", header: "GGR", align: "right", render: (r) => fmtZar(r.ggr) },
            { key: "avg_revenue_per_vip", header: "Avg Rev / VIP", align: "right", render: (r) => fmtZar(r.avg_revenue_per_vip) },
            { key: "sports_share", header: "Sports %", align: "right", render: (r) => `${r.sports_share.toFixed(0)}%` },
            { key: "casino_share", header: "Casino %", align: "right", render: (r) => `${r.casino_share.toFixed(0)}%` },
          ]}
          data={managers}
        />
      </div>

      {/* Top 20 Players */}
      <div className="rounded-xl p-5" style={CARD}>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Top 20 VIPs by Turnover</h3>
        <p className="text-xs text-gray-500 mb-3">Turnover for selected period</p>
        <DataTable<TopPlayer & { rank: number }>
          light
          compact
          emptyMessage={loading ? "Loading…" : "No player data."}
          columns={[
            { key: "rank", header: "#", render: (r) => String(r.rank) },
            { key: "user_id", header: "User ID", mono: true, render: (r) => r.user_id ?? "—" },
            { key: "account_manager", header: "Manager" },
            { key: "vip_lifecycle_stage", header: "Stage" },
            { key: "turnover", header: "Turnover", align: "right", render: (r) => fmtZar(r.turnover) },
            { key: "ggr", header: "GGR", align: "right", render: (r) => fmtZar(r.ggr) },
            { key: "bets", header: "Bets", align: "right", render: (r) => formatCompact(r.bets) },
          ]}
          data={topPlayers.map((p, i) => ({ ...p, rank: i + 1 }))}
        />
      </div>

      {/* ── Revenue Trends (31-day) ─────────────────────────────────────── */}
      {aggregatedTrends.length > 0 && (
        <div className="rounded-xl p-5 mb-4" style={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Revenue Trends</h3>
          <p className="text-xs text-gray-500 mb-4">GGR and Turnover — {filters.granularity} view</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={aggregatedTrends} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={xTickFormatter} interval={xInterval} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R${formatCompact(v)}`} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number, name: string) => [fmtZar(v), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="ggr"      name="GGR"      stroke={CHART_COLORS.ggr}      strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="turnover" name="Turnover"  stroke={CHART_COLORS.turnover} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total GGR",      value: fmtZar(aggregatedTrends.reduce((s, p) => s + p.ggr, 0)) },
              { label: "Total Turnover", value: fmtZar(aggregatedTrends.reduce((s, p) => s + p.turnover, 0)) },
              { label: `Avg ${filters.granularity === "daily" ? "Daily" : filters.granularity === "weekly" ? "Weekly" : "Monthly"} GGR`, value: fmtZar(aggregatedTrends.reduce((s, p) => s + p.ggr, 0) / Math.max(1, aggregatedTrends.length)) },
              { label: "Avg Margin",     value: `${(aggregatedTrends.reduce((s, p) => s + p.margin, 0) / Math.max(1, aggregatedTrends.filter(p => p.turnover > 0).length)).toFixed(1)}%` },
            ].map((t) => (
              <div key={t.label} className="text-center">
                <div className="text-xs text-gray-500">{t.label}</div>
                <div className="text-sm font-semibold text-gray-800 mt-0.5">{t.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6-Month Performance ─────────────────────────────────────────── */}
      {monthly.length > 0 && (
        <div className="rounded-xl p-5 mb-4" style={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">6-Month Performance</h3>
          <p className="text-xs text-gray-500 mb-4">Monthly GGR and Turnover comparison</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R${formatCompact(v)}`} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number, name: string) => [fmtZar(v), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="ggr"      name="GGR"      fill={CHART_COLORS.ggr}      radius={[3, 3, 0, 0]} />
              <Bar dataKey="turnover" name="Turnover"  fill={CHART_COLORS.turnover} radius={[3, 3, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Month", "Active VIPs", "GGR", "Turnover", "Margin %", "Bets"].map((h) => (
                    <th key={h} className="text-left py-1.5 pr-4 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-b border-gray-50">
                    <td className="py-1.5 pr-4 text-gray-700 font-medium">{m.month}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{formatCompact(m.active_vips)}</td>
                    <td className="py-1.5 pr-4 text-gray-700">{fmtZar(m.ggr)}</td>
                    <td className="py-1.5 pr-4 text-gray-700">{fmtZar(m.turnover)}</td>
                    <td className="py-1.5 pr-4 text-gray-600">{m.margin.toFixed(1)}%</td>
                    <td className="py-1.5 pr-4 text-gray-600">{formatCompact(m.bets)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Hourly Activity Analysis ────────────────────────────────────── */}
      {hourly.length > 0 && hourly.some((h) => h.bets > 0) && (
        <div className="rounded-xl p-5 mb-4" style={CARD}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Hourly Activity</h3>
          <p className="text-xs text-gray-500 mb-4">Peak betting hours (SAST) — aggregated across selected period</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number, name: string) => [formatCompact(v), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="sports_bets" name="Sports Bets" fill={CHART_COLORS.sports}  radius={[2, 2, 0, 0]} stackId="a" />
              <Bar dataKey="casino_bets" name="Casino Bets" fill={CHART_COLORS.casino}  radius={[2, 2, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
          {(() => {
            const peak = hourly.reduce((best, h) => h.bets > best.bets ? h : best, hourly[0]);
            return (
              <p className="text-xs text-gray-500 mt-3">
                Peak hour: <span className="font-semibold text-gray-700">{peak.label}</span> — {formatCompact(peak.bets)} bets
              </p>
            );
          })()}
        </div>
      )}
    </DashboardLayout>
  );
}
