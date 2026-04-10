import { useEffect, useMemo, useState } from "react";
/**
 * PLAYA BETS — Casino & Games Page
 * DWH Views: view_CasinoBets, view_CasinoGames, view_VirtualGames
 * Data source: Supabase casino_daily table via /api/casino/kpis
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import MockOverlay from "@/components/MockOverlay";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList,
} from "recharts";
import { Gamepad2, DollarSign, TrendingUp } from "lucide-react";
import { casinoProviders as baseCasinoProviders, casinoKPIs as baseCasinoKPIs } from "@/lib/mockData";
import { formatCompact, formatFull } from "@/lib/formatters";
import {
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";

import { cachedFetch } from "@/lib/apiCache";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
  red: "oklch(0.55 0.22 25)",
};

export default function CasinoPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [liveCasinoKPIs, setLiveCasinoKPIs] = useState<typeof baseCasinoKPIs | null>(null);
  const [liveCasinoProviders, setLiveCasinoProviders] = useState<typeof baseCasinoProviders | null>(null);

  useEffect(() => {
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
    fetchJson<{ stake?: number; winnings?: number; ggr?: number; actives?: number; bets?: number; hold_pct?: number }>(
      `/casino/kpis?${query}`
    )
      .then((d) => {
        const stake    = Number(d.stake    ?? 0);
        const winnings = Number(d.winnings ?? 0);
        const ggr      = Number(d.ggr      ?? 0);
        if (stake === 0 && winnings === 0 && ggr === 0) {
          setLiveCasinoKPIs(null);
          return;
        }
        setLiveCasinoKPIs({
          ...baseCasinoKPIs,
          totalStake:    stake,
          totalWinnings: winnings,
          grossProfit:   ggr,
          margin:        stake > 0 ? Number(((ggr / stake) * 100).toFixed(1)) : 0,
        });
      })
      .catch(() => setLiveCasinoKPIs(null));

    fetchJson<{ providers?: Array<{ provider?: string; provider_name?: string; casinoType?: string; casino_type?: string; bets?: number; stake?: number; winnings?: number; profit?: number; ggr?: number }> }>(
      `/casino/providers?${query}`
    )
      .then((d) => {
        const providers = (d.providers ?? [])
          .map((row) => ({
            provider: String(row.provider ?? row.provider_name ?? "Unknown"),
            casinoType: String(row.casinoType ?? row.casino_type ?? "Casino"),
            bets: Number(row.bets ?? 0),
            stake: Number(row.stake ?? 0),
            winnings: Number(row.winnings ?? 0),
            profit: Number(row.profit ?? row.ggr ?? (Number(row.stake ?? 0) - Number(row.winnings ?? 0))),
          }))
          .filter((row) => row.stake !== 0 || row.winnings !== 0 || row.profit !== 0 || row.bets !== 0);

        setLiveCasinoProviders(providers.length > 0 ? providers : null);
      })
      .catch(() => setLiveCasinoProviders(null));
  }, [filters.dateFrom, filters.dateTo]);

  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const casinoProviders = useMemo(
    () => {
      if (liveCasinoProviders) return liveCasinoProviders;
      return scaleArrayNumericFields(baseCasinoProviders, multiplier, ["provider", "casinoType"]);
    },
    [liveCasinoProviders, multiplier],
  );
  const casinoKPIs = useMemo(() => {
    // Use live KPIs if available, otherwise fall back to scaled mock
    if (liveCasinoKPIs) return liveCasinoKPIs;
    const scaled = scaleObjectNumericFields(baseCasinoKPIs, multiplier);
    const totalStake = casinoProviders.reduce((sum, row) => sum + row.stake, 0);
    const totalWinnings = casinoProviders.reduce((sum, row) => sum + row.winnings, 0);
    const grossProfit = totalStake - totalWinnings;
    const margin = totalStake > 0 ? Number(((grossProfit / totalStake) * 100).toFixed(1)) : 0;
    return {
      ...scaled,
      totalStake,
      totalWinnings,
      grossProfit,
      margin,
    };
  }, [casinoProviders, multiplier, liveCasinoKPIs]);
  const totalStakeSafe = Math.max(1, casinoKPIs.totalStake);
  const providerShareData = useMemo(
    () =>
      casinoProviders.map((provider) => ({
        ...provider,
        sharePct: Number(((provider.stake / totalStakeSafe) * 100).toFixed(1)),
      })),
    [casinoProviders, totalStakeSafe],
  );

  const top10ByProfit = useMemo(
    () => [...casinoProviders].sort((a, b) => b.profit - a.profit).slice(0, 10),
    [casinoProviders],
  );
  const top10ByStake = useMemo(
    () => [...providerShareData].sort((a, b) => b.sharePct - a.sharePct).slice(0, 10),
    [providerShareData],
  );
  return (
    <DashboardLayout title="Casino & Games" subtitle="Provider performance, virtual games, and casino revenue"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KpiCard title="Total Casino Stake" value={formatFull(casinoKPIs.totalStake)} subtitle="All providers" icon={<DollarSign size={18} />} accent="gold" />
          <KpiCard title="Total Winnings" value={formatFull(casinoKPIs.totalWinnings)} subtitle="Paid to players" icon={<TrendingUp size={18} />} accent="amber" />
          <KpiCard title="Gross Profit" value={formatFull(casinoKPIs.grossProfit)} subtitle="Stake minus winnings" icon={<Gamepad2 size={18} />} accent="green" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Provider bar chart */}
        <div className="relative lg:col-span-2 rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <MockOverlay active={!liveCasinoProviders} badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Revenue by Provider</h3>
          <p className="text-xs text-gray-400 mb-4">Gross profit per casino provider — top 10</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={top10ByProfit} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="provider" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip formatter={(v: number) => [`${formatCompact(v)}`, "Profit"]} contentStyle={{ background: "#fff", border: "1px solid #e4ece4", fontSize: 11 }} />
              <Bar dataKey="profit" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} barSize={24}>
                <LabelList
                  dataKey="profit"
                  position="right"
                  formatter={(value: number) => formatCompact(Number(value))}
                  style={{ fill: "#374151", fontSize: 11, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Provider share bars */}
        <div className="relative rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <MockOverlay active={!liveCasinoProviders} badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Stake Share</h3>
          <p className="text-xs text-gray-400 mb-4">By provider — top 10</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={top10ByStake} layout="vertical" margin={{ top: 0, right: 22, bottom: 0, left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="provider"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={100}
              />
              <Tooltip formatter={(v: number) => [`${v}%`, "Stake Share"]} contentStyle={{ background: "#fff", border: "1px solid #e4ece4", fontSize: 11 }} />
              <Bar dataKey="sharePct" fill={CHART_COLORS.teal} radius={[0, 4, 4, 0]} barSize={20}>
                <LabelList
                  dataKey="sharePct"
                  position="right"
                  formatter={(value: number) => `${Number(value).toFixed(1)}%`}
                  style={{ fill: "#374151", fontSize: 11, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Provider table */}
      <div className="relative rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <MockOverlay active={!liveCasinoProviders} badge label="Mock Data" />
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Provider Detail</h3>
        <p className="text-xs text-gray-400 mb-4">view_CasinoBets — all providers</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #e4ece4" }}>
                {["Provider", "Type", "Total Bets", "Stake", "Winnings", "Gross Profit", "Margin"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 pb-2 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {casinoProviders.map((p) => (
                <tr key={p.provider} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td className="py-2.5 pr-4 text-gray-800 font-medium">{p.provider}</td>
                  <td className="py-2.5 pr-4 text-gray-500 text-xs">{p.casinoType}</td>
                  <td className="py-2.5 pr-4 text-gray-500 text-xs font-mono">{formatFull(p.bets)}</td>
                  <td className="py-2.5 pr-4 text-gray-500 text-xs font-mono">{formatFull(p.stake)}</td>
                  <td className="py-2.5 pr-4 text-gray-500 text-xs font-mono">{formatFull(p.winnings)}</td>
                  <td className="py-2.5 pr-4 text-xs font-mono font-semibold" style={{color: CHART_COLORS.gold }}>{formatFull(p.profit)}</td>
                  <td className="py-2.5 text-xs font-semibold" style={{ color: CHART_COLORS.green }}>
                    {(p.profit / p.stake * 100).toFixed(1)}%
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
