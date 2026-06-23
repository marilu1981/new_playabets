/**
 * PLAYA BETS — CRM Page
 * Customer relationship management metrics: cohort analysis,
 * retention, Average Deposit Value, LTV, and Churn.
 */
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import { usePersistedFilters } from "@/lib/usePersistedFilters";
import KpiCard from "@/components/KpiCard";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
// LineChart/Line kept for cohort conversion rate chart
import { Users, TrendingUp, DollarSign, Activity, Clock } from "lucide-react";
import { formatCompact, formatFull } from "@/lib/formatters";
import { cachedFetch } from "@/lib/apiCache";
import { aggregateByGranularity } from "@/pages/home/homeUtils";
import AiInsightsPanel from "@/components/AiInsightsPanel";
import type { AiInsights } from "@/lib/generateReport";

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

const TT_STYLE = { background: "#fff", border: "1px solid #e4ece4", borderRadius: 8, fontSize: 11 };
const CARD_BG  = { background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };

export default function CrmPage() {
  const [filters, setFilters] = usePersistedFilters();
  const [cohortData, setCohortData]   = useState<Array<{ date: string; registrations?: number; ftds_d7?: number; ftds_d30?: number; rate_d7?: number | null; rate_d30?: number | null }>>([]);
  const [avgDepositValue, setAvgDepositValue] = useState<number | null>(null);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [churnPct, setChurnPct]   = useState<number | null>(null);
  const [arpu, setArpu]           = useState<number | null>(null);
  const [totalActives, setTotalActives] = useState<number | null>(null);

  type RetentionCohort = { cohort_month: string; cohort_size: number; retained_d7: number; retained_d30: number; retained_d90: number; rate_d7: number; rate_d30: number; rate_d90: number };
  const [retentionCohorts, setRetentionCohorts] = useState<RetentionCohort[]>([]);
  const [retentionSummary, setRetentionSummary] = useState<{ avg_d7: number; avg_d30: number; avg_d90: number } | null>(null);

  type PaymentProvider = { provider: string; deposits: number; withdrawals: number; deposit_count: number; withdrawal_count: number; net: number };
  const [paymentMethods, setPaymentMethods] = useState<PaymentProvider[]>([]);

  useEffect(() => {
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;

    // Cohort conversion rates — aggregate by granularity
    fetchJson<{ points: Array<{ date: string; registrations?: number; ftds_d7?: number; ftds_d30?: number; rate_d7?: number | null; rate_d30?: number | null }> }>(
      `/timeseries/conversion-cohorts?${query}`
    ).then((d) => {
      const pts = d.points ?? [];
      if (filters.granularity === "daily") {
        setCohortData(pts);
      } else {
        // Aggregate to weekly/monthly — sum counts, average rates
        const agg = aggregateByGranularity(
          pts as Record<string, unknown>[],
          filters.granularity,
          (row) => row["date"] as string,
          { avgFields: ["rate_d7", "rate_d30"] }
        );
        setCohortData(agg as typeof pts);
      }
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

    // Payment methods breakdown
    fetchJson<{ has_data: boolean; providers: PaymentProvider[] }>(`/transactions/providers?${query}`)
      .then((d) => { if (d.has_data) setPaymentMethods(d.providers ?? []); })
      .catch(() => {});

    // 7/30/90-day retention by cohort
    fetchJson<{ has_data: boolean; cohorts: RetentionCohort[]; summary: { avg_d7: number; avg_d30: number; avg_d90: number } }>(
      `/crm/retention?start=${filters.dateFrom}&end=${filters.dateTo}`
    ).then((d) => {
      if (d.has_data) {
        setRetentionCohorts(d.cohorts ?? []);
        setRetentionSummary(d.summary ?? null);
      }
    }).catch(() => {});
  }, [filters.dateFrom, filters.dateTo, filters.granularity]);

  // CRM AI Insights — fires once churn and retention data are available
  useEffect(() => {
    if (churnPct === null && retentionSummary === null && totalActives === null) return;
    const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
    const API_KEY_H = (import.meta.env.VITE_API_KEY as string | undefined) ?? "";
    const params = new URLSearchParams({
      start: filters.dateFrom, end: filters.dateTo,
      churn_pct: String(churnPct ?? 0),
      retention_d7: String(retentionSummary?.avg_d7 ?? 0),
      retention_d30: String(retentionSummary?.avg_d30 ?? 0),
      active_players: String(totalActives ?? 0),
      avg_ftd_value: String(Math.round(avgDepositValue ?? 0)),
      // ARPU as NGR proxy
      ngr: String(arpu != null && totalActives != null ? arpu * totalActives : 0),
      ggr: String(arpu != null && totalActives != null ? arpu * totalActives : 0),
      registrations: "0", ftds: "0",
    });
    setAiLoading(true);
    fetch(`${API_BASE}/insights/ai-summary?${params}`, {
      method: "POST",
      headers: { "Accept": "application/json", ...(API_KEY_H ? { "X-API-Key": API_KEY_H } : {}) },
    })
      .then(r => r.json())
      .then(res => { if (res.available) setAiInsights(res as AiInsights); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dateFrom, filters.dateTo, churnPct, retentionSummary?.avg_d30, totalActives]);

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
      subtitle="Cohort analysis, retention, and player value"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}
    >
      {/* KPI Row */}
      <div className="rounded-xl p-5 mb-6" style={CARD_BG}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title="Avg Deposit Value"
            value={avgDepositValue != null ? formatFull(avgDepositValue) : "Pending"}
            subtitle="Total Deposits / Deposit Count"
            tooltip="Average Deposit Value = Total Deposits / Number of deposit transactions. Measures the typical size of each deposit."
            icon={<DollarSign size={18} />}
            accent="gold"
          />
          <KpiCard
            title="Churn (Actives)"
            value={churnPct != null ? `${churnPct}%` : "—"}
            subtitle="Players left / Total prev month"
            tooltip="Churn Rate = Players who did not return this month / Total active players in the previous month x 100."
            icon={<Activity size={18} />}
            accent="amber"
          />
          <KpiCard
            title="ARPU"
            value={arpu != null ? formatFull(arpu) : "—"}
            subtitle="NGR / Total Actives"
            tooltip="Average Revenue Per User = Net Gaming Revenue / Total Active Players. Key measure of player value."
            icon={<TrendingUp size={18} />}
            accent="green"
          />
          <KpiCard
            title="Total Actives"
            value={totalActives != null ? formatFull(totalActives) : "—"}
            subtitle="Unique sports + casino players"
            tooltip="Total unique players who placed at least one bet (sports or casino) during the selected period."
            icon={<Users size={18} />}
            accent="teal"
          />
          <KpiCard
            title="LTV (Period)"
            value={arpu != null ? formatFull(arpu) : "—"}
            subtitle="NGR / Active Players"
            tooltip="Lifetime Value proxy = NGR / Active Players for the period. True LTV requires full player history."
            icon={<TrendingUp size={18} />}
            accent="green"
          />
          <KpiCard
            title="Retention Rate"
            value={churnPct != null ? `${(100 - churnPct).toFixed(1)}%` : "—"}
            subtitle="100% - Monthly Churn"
            tooltip="Retention Rate = 100% - Churn Rate. Percentage of active players who returned the following month."
            icon={<Clock size={18} />}
            accent="teal"
          />
          <KpiCard
            title="Cohort D7 Conv"
            value={cohortSummary != null ? `${cohortSummary.avgD7Rate.toFixed(1)}%` : "—"}
            subtitle="Avg D7 FTD conversion"
            tooltip="Of players who registered, what % made their first deposit within 7 days. Measures early onboarding effectiveness."
            icon={<Users size={18} />}
            accent="gold"
          />
          <KpiCard
            title="Cohort D30 Conv"
            value={cohortSummary != null ? `${cohortSummary.avgD30Rate.toFixed(1)}%` : "—"}
            subtitle="Avg D30 FTD conversion"
            tooltip="Of players who registered, what % made their first deposit within 30 days. Measures medium-term conversion."
            icon={<Users size={18} />}
            accent="green"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-4">
        {/* CRM AI Insights */}
        <AiInsightsPanel insights={aiInsights} loading={aiLoading} title="CRM AI Insights" />

        {/* Cohort D7 / D30 Conversion */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Cohort — FTD Conversion Rate</h3>
          <p className="text-xs text-gray-500 mb-4">% of registrants who made first deposit within 7 / 30 days</p>
          {cohortData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cohortData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }}
                  tickFormatter={(v) => filters.granularity === "monthly" ? v.slice(0, 7) : filters.granularity === "weekly" ? `W${v.slice(5)}` : v.slice(5)}
                  interval={filters.granularity === "daily" ? 6 : 0} axisLine={false} tickLine={false} />
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

      </div>

      {/* Cohort Registration + FTD Bar Chart */}
      {cohortData.length > 0 && (
        <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Cohort — Registrations vs FTDs</h3>
          <p className="text-xs text-gray-500 mb-4">D7 and D30 first deposits by registration date</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cohortData} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }}
                tickFormatter={(v) => filters.granularity === "monthly" ? v.slice(0, 7) : v.slice(5)}
                interval={filters.granularity === "daily" ? 4 : 0} axisLine={false} tickLine={false} />
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

      {/* Payment Methods Breakdown */}
      {paymentMethods.length > 0 && (
        <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Payment Methods</h3>
          <p className="text-xs text-gray-500 mb-4">Deposits and withdrawals by payment provider — selected period</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Provider", "Deposits", "Withdrawals", "Net", "Dep Txns", "Wd Txns"].map((h) => (
                    <th key={h} className={`py-2 pr-4 text-gray-500 font-semibold text-[10px] uppercase tracking-wider ${h === "Provider" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paymentMethods.filter(p => p.deposits > 0 || Math.abs(p.withdrawals) > 0).map((p) => (
                  <tr key={p.provider} className="border-b border-gray-50">
                    <td className="py-2 pr-4 text-gray-700 font-medium">{p.provider}</td>
                    <td className="py-2 pr-4 text-right text-gray-700">{p.deposits > 0 ? `R ${formatFull(Math.round(p.deposits))}` : "—"}</td>
                    <td className="py-2 pr-4 text-right" style={{ color: p.withdrawals < 0 ? "#d94040" : "#6b7280" }}>{p.withdrawals < 0 ? `R ${formatFull(Math.round(Math.abs(p.withdrawals)))}` : "—"}</td>
                    <td className="py-2 pr-4 text-right font-medium" style={{ color: p.net >= 0 ? COLORS.gold : "#d94040" }}>{`R ${formatFull(Math.round(p.net))}`}</td>
                    <td className="py-2 pr-4 text-right text-gray-500">{p.deposit_count > 0 ? formatCompact(p.deposit_count) : "—"}</td>
                    <td className="py-2 pr-4 text-right text-gray-500">{p.withdrawal_count > 0 ? formatCompact(p.withdrawal_count) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7 / 30 / 90-day Retention */}
      {retentionSummary && (
        <div className="rounded-xl p-5 mb-4" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Player Retention</h3>
          <p className="text-xs text-gray-500 mb-4">% of new players who returned within 7, 30, and 90 days — by cohort month</p>

          {/* Summary KPI cards */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              { label: "D7 Retention",  value: `${retentionSummary.avg_d7}%`,  color: COLORS.gold,  desc: "Return within 7 days" },
              { label: "D30 Retention", value: `${retentionSummary.avg_d30}%`, color: COLORS.teal,  desc: "Return within 30 days" },
              { label: "D90 Retention", value: `${retentionSummary.avg_d90}%`, color: COLORS.green, desc: "Return within 90 days" },
            ].map((t) => (
              <div key={t.label} className="rounded-lg p-4 text-center" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                <div className="text-2xl font-bold mb-1" style={{ color: t.color }}>{t.value}</div>
                <div className="text-xs font-semibold text-gray-700">{t.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.desc}</div>
              </div>
            ))}
          </div>

          {/* Retention by cohort — grouped bar chart */}
          {retentionCohorts.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={retentionCohorts} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
                <XAxis dataKey="cohort_month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} width={35} domain={[0, 100]} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="rate_d7"  name="D7 Retention"  fill={COLORS.gold}  radius={[3, 3, 0, 0]} />
                <Bar dataKey="rate_d30" name="D30 Retention" fill={COLORS.teal}  radius={[3, 3, 0, 0]} />
                <Bar dataKey="rate_d90" name="D90 Retention" fill={COLORS.green} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Cohort table */}
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Cohort Month", "New Players", "D7 Retained", "D7 %", "D30 Retained", "D30 %", "D90 Retained", "D90 %"].map((h) => (
                    <th key={h} className="text-left py-1.5 pr-3 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retentionCohorts.map((c) => (
                  <tr key={c.cohort_month} className="border-b border-gray-50">
                    <td className="py-1.5 pr-3 text-gray-700 font-medium">{c.cohort_month}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{c.cohort_size.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{c.retained_d7.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 font-medium" style={{ color: COLORS.gold }}>{c.rate_d7}%</td>
                    <td className="py-1.5 pr-3 text-gray-600">{c.retained_d30.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 font-medium" style={{ color: COLORS.teal }}>{c.rate_d30}%</td>
                    <td className="py-1.5 pr-3 text-gray-600">{c.retained_d90.toLocaleString()}</td>
                    <td className="py-1.5 pr-3 font-medium" style={{ color: COLORS.green }}>{c.rate_d90}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
