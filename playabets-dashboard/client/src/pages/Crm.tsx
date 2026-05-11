/**
 * PLAYA BETS — CRM Page
 * Customer relationship management metrics: cohort analysis,
 * retention, Average Deposit Value, LTV, Churn, RFM segments.
 */
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { Users, TrendingUp, DollarSign, Activity, Clock } from "lucide-react";
import { formatCompact, formatFull } from "@/lib/formatters";
import { cachedFetch } from "@/lib/apiCache";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const COLORS = {
  gold:  "#7ab800",
  green: "#3d8c2e",
  teal:  "#0d8f8f",
  amber: "#ffb500",
  red:   "#d94040",
  blue:  "#3b82f6",
};

const SEGMENT_COLORS: Record<string, string> = {
  VIP:      COLORS.gold,
  Active:   COLORS.green,
  New:      COLORS.teal,
  Cooling:  COLORS.amber,
  Lapsed:   COLORS.red,
  Dormant:  "#9ca3af",
};

const TT_STYLE = { background: "#fff", border: "1px solid #e4ece4", borderRadius: 8, fontSize: 11 };
const CARD_BG  = { background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };

export default function CrmPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [cohortData, setCohortData]   = useState<Array<{ date: string; registrations?: number; ftds_d7?: number; ftds_d30?: number; rate_d7?: number | null; rate_d30?: number | null }>>([]);
  const [rfmData, setRfmData]         = useState<Array<{ segment: string; count: number }>>([]);
  const [avgDepositValue, setAvgDepositValue] = useState<number | null>(null);
  const [churnPct, setChurnPct]   = useState<number | null>(null);
  const [arpu, setArpu]           = useState<number | null>(null);
  const [totalActives, setTotalActives] = useState<number | null>(null);

  useEffect(() => {
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;

    // Cohort conversion rates
    fetchJson<{ points: Array<{ date: string; registrations?: number; ftds_d7?: number; ftds_d30?: number; rate_d7?: number | null; rate_d30?: number | null }> }>(
      `/timeseries/conversion-cohorts?${query}`
    ).then((d) => setCohortData(d.points ?? [])).catch(() => {});

    // RFM segments
    fetchJson<{ rows: Array<{ date: string; rfm_vip?: number; rfm_active?: number; rfm_new?: number; rfm_cooling?: number; rfm_lapsed?: number; rfm_dormant?: number }> }>(
      `/rfm/segments?${query}`
    ).then((d) => {
      const rows = d.rows ?? [];
      if (!rows.length) return;
      const latest = rows[rows.length - 1];
      setRfmData([
        { segment: "VIP",     count: Number(latest.rfm_vip     ?? 0) },
        { segment: "Active",  count: Number(latest.rfm_active  ?? 0) },
        { segment: "New",     count: Number(latest.rfm_new     ?? 0) },
        { segment: "Cooling", count: Number(latest.rfm_cooling ?? 0) },
        { segment: "Lapsed",  count: Number(latest.rfm_lapsed  ?? 0) },
        { segment: "Dormant", count: Number(latest.rfm_dormant ?? 0) },
      ].filter((s) => s.count > 0));
    }).catch(() => {});

    // KPIs — churn, total actives, NGR for ARPU
    fetchJson<{ churn_pct?: number; total_actives_unique?: number; ngr?: number }>(
      `/kpis?${query}`
    ).then((d) => {
      setChurnPct(d.churn_pct != null ? Number(d.churn_pct) : null);
      const act = Number(d.total_actives_unique ?? 0);
      setTotalActives(act > 0 ? act : null);
      const ngr = Number(d.ngr ?? 0);
      setArpu(act > 0 && ngr > 0 ? Math.round(ngr / act) : null);
    }).catch(() => {});

    // Average Deposit Value = deposits / deposit_count or deposits / depositors
    Promise.allSettled([
      fetchJson<{ deposits?: number; deposit_count?: number }>(`/transactions/kpis?${query}`),
      fetchJson<{ deposits?: number; period_unique_depositors?: number }>(`/kpis?${query}`),
    ]).then(([txRes, kpisRes]) => {
      const tx = txRes.status === "fulfilled" ? txRes.value : null;
      const kp = kpisRes.status === "fulfilled" ? kpisRes.value : null;
      const dep = Number(tx?.deposits ?? kp?.deposits ?? 0);
      const cnt = Number(tx?.deposit_count ?? 0);
      const dep_unique = Number(kp?.period_unique_depositors ?? 0);
      if (cnt > 0) setAvgDepositValue(dep / cnt);
      else if (dep_unique > 0) setAvgDepositValue(dep / dep_unique);
      else setAvgDepositValue(null);
    }).catch(() => {});
  }, [filters.dateFrom, filters.dateTo]);

  const totalRfm = rfmData.reduce((s, r) => s + r.count, 0);

  // Cohort summary for period
  const cohortSummary = cohortData.length > 0 ? {
    totalRegs: cohortData.reduce((s, r) => s + (r.registrations ?? 0), 0),
    ftdsD7: cohortData.reduce((s, r) => s + (r.ftds_d7 ?? 0), 0),
    ftdsD30: cohortData.reduce((s, r) => s + (r.ftds_d30 ?? 0), 0),
    avgD7Rate: cohortData.filter(r => r.rate_d7 != null).reduce((s, r) => s + (r.rate_d7 ?? 0), 0) /
               Math.max(1, cohortData.filter(r => r.rate_d7 != null).length),
    avgD30Rate: cohortData.filter(r => r.rate_d30 != null).reduce((s, r) => s + (r.rate_d30 ?? 0), 0) /
                Math.max(1, cohortData.filter(r => r.rate_d30 != null).length),
  } : null;

  return (
    <DashboardLayout
      title="CRM Dashboard"
      subtitle="Cohort analysis, retention, player value and segment distribution"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}
    >
      {/* KPI Row */}
      <div className="rounded-xl p-5 mb-6" style={CARD_BG}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title="Avg Deposit Value"
            value={avgDepositValue != null ? formatFull(avgDepositValue) : "Pending"}
            subtitle="Total Deposits ÷ Deposit Count"
            icon={<DollarSign size={18} />}
            accent="gold"
          />
          <KpiCard
            title="Churn (Actives)"
            value={churnPct != null ? `${churnPct}%` : "—"}
            subtitle="Players left ÷ Total prev month"
            icon={<Activity size={18} />}
            accent="amber"
          />
          <KpiCard
            title="ARPU"
            value={arpu != null ? formatFull(arpu) : "—"}
            subtitle="NGR ÷ Total Actives"
            icon={<TrendingUp size={18} />}
            accent="green"
          />
          <KpiCard
            title="Total Actives"
            value={totalActives != null ? formatCompact(totalActives) : "—"}
            subtitle="Unique sports + casino players"
            icon={<Users size={18} />}
            accent="teal"
          />
          <KpiCard
            title="LTV (Period)"
            value={arpu != null ? formatFull(arpu) : "—"}
            subtitle="NGR ÷ Active Players"
            icon={<TrendingUp size={18} />}
            accent="green"
          />
          <KpiCard
            title="Retention Rate"
            value={churnPct != null ? `${(100 - churnPct).toFixed(1)}%` : "—"}
            subtitle="100% − Monthly Churn"
            icon={<Clock size={18} />}
            accent="teal"
          />
          <KpiCard
            title="Cohort D7 Conv"
            value={cohortSummary != null ? `${cohortSummary.avgD7Rate.toFixed(1)}%` : "—"}
            subtitle="Avg D7 FTD conversion"
            icon={<Users size={18} />}
            accent="gold"
          />
          <KpiCard
            title="Cohort D30 Conv"
            value={cohortSummary != null ? `${cohortSummary.avgD30Rate.toFixed(1)}%` : "—"}
            subtitle="Avg D30 FTD conversion"
            icon={<Users size={18} />}
            accent="green"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Cohort D7 / D30 Conversion */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Cohort — FTD Conversion Rate</h3>
          <p className="text-xs text-gray-500 mb-4">% of registrants who made first deposit within 7 / 30 days</p>
          {cohortData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cohortData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(0, 7)} interval={3} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={35} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v) => v == null ? "n/a" : `${Number(v).toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="rate_d7"  name="D7 Conv Rate"  stroke={COLORS.gold}  strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="rate_d30" name="D30 Conv Rate" stroke={COLORS.teal}  strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">No cohort data for selected period</div>
          )}
        </div>

        {/* RFM Segment Distribution */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Player Segments (RFM)</h3>
          <p className="text-xs text-gray-500 mb-4">Latest snapshot — {totalRfm.toLocaleString()} total players</p>
          {rfmData.length > 0 ? (
            <div className="flex gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={rfmData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} dataKey="count" nameKey="segment" paddingAngle={2}>
                    {rfmData.map((s) => <Cell key={s.segment} fill={SEGMENT_COLORS[s.segment] ?? COLORS.teal} />)}
                  </Pie>
                  <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatCompact(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col justify-center gap-1.5">
                {rfmData.map((s) => (
                  <div key={s.segment} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SEGMENT_COLORS[s.segment] ?? COLORS.teal }} />
                    <span className="text-gray-600 w-16">{s.segment}</span>
                    <span className="font-mono font-bold text-gray-800">{formatCompact(s.count)}</span>
                    <span className="text-gray-400">({totalRfm > 0 ? ((s.count / totalRfm) * 100).toFixed(1) : 0}%)</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-xs text-gray-400">No segment data available</div>
          )}
        </div>
      </div>

      {/* Cohort Registration + FTD Bar Chart */}
      {cohortData.length > 0 && (
        <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Cohort — Registrations vs FTDs</h3>
          <p className="text-xs text-gray-500 mb-4">D7 and D30 first deposits by registration date</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cohortData} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={45} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatCompact(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="registrations" name="Registrations" fill={COLORS.teal}  radius={[2, 2, 0, 0]} />
              <Bar dataKey="ftds_d7"       name="FTDs D7"       fill={COLORS.gold}  radius={[2, 2, 0, 0]} />
              <Bar dataKey="ftds_d30"      name="FTDs D30"      fill={COLORS.green} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardLayout>
  );
}
