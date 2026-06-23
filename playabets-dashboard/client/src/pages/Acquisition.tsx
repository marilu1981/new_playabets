/**
 * PLAYA BETS — Acquisition Dashboard
 * Marketing channel performance: Affiliates, Google Ads, Meta, Influencers, Organic.
 * Affiliate data from RavenTrack; other channels pending integration.
 */
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import { usePersistedFilters } from "@/lib/usePersistedFilters";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import { DollarSign, Target, TrendingUp, Users } from "lucide-react";
import { cachedFetch } from "@/lib/apiCache";
import { formatFull, formatCompact } from "@/lib/formatters";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const CARD_BG = { background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };

const CHANNEL_COLORS: Record<string, string> = {
  "Affiliates":  "#7ab800",
  "Google Ads":  "#4285F4",
  "Meta":        "#1877F2",
  "Influencers": "#ffb500",
  "Organic":     "#0d8f8f",
};

type ChannelRow = {
  channel: string;
  registrations: number;
  clicks?: number;
  ftds: number;
  ftd_amount: number;
  revenue: number;
  marketing_spend: number;
  cpa: number;
  roi_pct: number;
  avg_ftd_value: number;
  has_data: boolean;
};

type AffiliateRow = {
  affiliate_id?: string;
  affiliate_name?: string;
  clicks?: number;
  registrations: number;
  ftds: number;
  ftd_amount: number;
  revenue: number;
  marketing_spend: number;
  cpa: number;
  roi_pct: number;
  avg_ftd_value: number;
};

type KpiTotals = {
  registrations: number;
  ftds: number;
  ftd_amount: number;
  revenue: number;
  marketing_spend: number;
  cpa: number;
  roi_pct: number;
  avg_ftd_value: number;
};

const fmt = (v: number) => formatCompact(v);
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtZar = (v: number) => `R ${formatFull(Math.round(v))}`;

export default function AcquisitionPage() {
  const [filters, setFilters] = usePersistedFilters();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [totals, setTotals] = useState<KpiTotals | null>(null);
  const [hasData, setHasData] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const q = `start=${filters.dateFrom}&end=${filters.dateTo}`;
      const [kpiRes, chRes, affRes] = await Promise.allSettled([
        fetchJson<{ totals: KpiTotals; has_data: boolean }>(`/acquisition/kpis?${q}`),
        fetchJson<{ channels: ChannelRow[]; has_data: boolean }>(`/acquisition/channels?${q}`),
        fetchJson<{ rows: AffiliateRow[]; has_data: boolean }>(`/acquisition/affiliates?${q}&limit=100&sort_by=revenue`),
      ]);
      if (cancelled) return;

      if (kpiRes.status === "fulfilled") {
        setTotals(kpiRes.value.totals ?? null);
        setHasData(kpiRes.value.has_data ?? false);
      }
      if (chRes.status === "fulfilled") {
        setChannels(chRes.value.channels ?? []);
      }
      if (affRes.status === "fulfilled") {
        setAffiliates(affRes.value.rows ?? []);
      }
      setLoading(false);
    }
    load().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters.dateFrom, filters.dateTo]);

  const noDataBanner = !hasData && !loading;

  return (
    <DashboardLayout
      title="Acquisition"
      subtitle="Marketing channel performance, CPA, ROI, and affiliate leaderboard"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}
    >
      {noDataBanner && (
        <div className="rounded-xl p-4 mb-4 text-sm text-amber-800"
          style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
          <strong>Affiliate data not yet available.</strong> The RavenTrack API integration
          is pending token scope approval. Once resolved, run{" "}
          <code className="text-xs bg-amber-100 px-1 rounded">python -m src.extract.raventrack_affiliates</code>{" "}
          on the VM to populate this dashboard.
        </div>
      )}

      {/* Period KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <KpiCard
          title="Marketing Spend"
          value={totals ? fmtZar(totals.marketing_spend) : "—"}
          subtitle="Total paid acquisition cost"
          icon={<DollarSign size={18} />}
          accent="amber"
          loading={loading}
        />
        <KpiCard
          title="CPA"
          value={totals && totals.cpa > 0 ? fmtZar(totals.cpa) : "—"}
          subtitle="Cost per first-time depositor"
          icon={<Target size={18} />}
          accent="teal"
          loading={loading}
        />
        <KpiCard
          title="ROI"
          value={totals && totals.marketing_spend > 0 ? fmtPct(totals.roi_pct) : "—"}
          subtitle="(Revenue − Spend) ÷ Spend"
          icon={<TrendingUp size={18} />}
          accent="green"
          loading={loading}
        />
        <KpiCard
          title="Avg FTD Value"
          value={totals && totals.avg_ftd_value > 0 ? fmtZar(totals.avg_ftd_value) : "—"}
          subtitle="Total first deposits ÷ FTDs"
          icon={<Users size={18} />}
          accent="gold"
          loading={loading}
        />
      </div>

      {/* Channel breakdown */}
      <div className="rounded-xl p-5 mb-5" style={CARD_BG}>
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Channel Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                {["Channel", "Registrations", "FTDs", "Avg FTD Value", "Revenue", "Mkt Spend", "CPA", "ROI"].map(h => (
                  <th key={h} className="text-left py-2 pr-4 font-semibold text-gray-500 uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => (
                <tr key={ch.channel} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: CHANNEL_COLORS[ch.channel] ?? "#999" }} />
                      <span className="font-medium text-gray-800">{ch.channel}</span>
                      {!ch.has_data && (
                        <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Pending</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-700">{ch.has_data ? fmt(ch.registrations) : "—"}</td>
                  <td className="py-2.5 pr-4 text-gray-700">{ch.has_data ? fmt(ch.ftds) : "—"}</td>
                  <td className="py-2.5 pr-4 text-gray-700">{ch.has_data && ch.avg_ftd_value > 0 ? fmtZar(ch.avg_ftd_value) : "—"}</td>
                  <td className="py-2.5 pr-4 text-gray-700">{ch.has_data && ch.revenue > 0 ? fmtZar(ch.revenue) : "—"}</td>
                  <td className="py-2.5 pr-4 text-gray-700">{ch.has_data && ch.marketing_spend > 0 ? fmtZar(ch.marketing_spend) : "—"}</td>
                  <td className="py-2.5 pr-4 text-gray-700">{ch.has_data && ch.cpa > 0 ? fmtZar(ch.cpa) : "—"}</td>
                  <td className="py-2.5 pr-4">
                    {ch.has_data && ch.marketing_spend > 0 ? (
                      <span className={`font-medium ${ch.roi_pct >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {fmtPct(ch.roi_pct)}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {channels.length === 0 && !loading && (
                <tr><td colSpan={8} className="py-6 text-center text-gray-400 text-xs">No channel data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Affiliate leaderboard */}
      <div className="rounded-xl p-5" style={CARD_BG}>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Affiliate Leaderboard</h3>
        <p className="text-xs text-gray-500 mb-4">Ranked by revenue — RavenTrack data</p>
        <DataTable<AffiliateRow>
          compact
          emptyMessage={loading ? "Loading…" : "No affiliate data yet. Pending RavenTrack token approval."}
          columns={[
            { key: "affiliate_name", header: "Affiliate", render: r => r.affiliate_name ?? r.affiliate_id ?? "—" },
            { key: "clicks",        header: "Clicks",   render: r => r.clicks != null ? fmt(r.clicks) : "—" },
            { key: "registrations", header: "Regs",     render: r => fmt(r.registrations) },
            { key: "ftds",          header: "FTDs",     render: r => fmt(r.ftds) },
            { key: "avg_ftd_value", header: "Avg FTD",  render: r => r.avg_ftd_value > 0 ? fmtZar(r.avg_ftd_value) : "—", align: "right" },
            { key: "revenue",       header: "Revenue",  render: r => fmtZar(r.revenue), align: "right" },
            { key: "marketing_spend", header: "Spend",  render: r => r.marketing_spend > 0 ? fmtZar(r.marketing_spend) : "—", align: "right" },
            { key: "cpa",           header: "CPA",      render: r => r.cpa > 0 ? fmtZar(r.cpa) : "—", align: "right" },
            {
              key: "roi_pct", header: "ROI",
              render: r => r.marketing_spend > 0
                ? <span className={r.roi_pct >= 0 ? "text-green-700 font-medium" : "text-red-600 font-medium"}>{fmtPct(r.roi_pct)}</span>
                : "—",
              align: "right",
            },
          ]}
          data={affiliates}
        />
      </div>
    </DashboardLayout>
  );
}
