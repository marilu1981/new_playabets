import { useEffect, useMemo, useState } from "react";
/**
 * PLAYA BETS — Casino & Games Page
 * DWH Views: view_CasinoBets, view_CasinoGames, view_VirtualGames
 * Data source: Supabase casino_daily table via /api/casino/kpis
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { Gamepad2, DollarSign, TrendingUp, Percent } from "lucide-react";
import { casinoProviders as baseCasinoProviders, casinoKPIs as baseCasinoKPIs } from "@/lib/mockData";
import { formatCompact, formatNumber } from "@/lib/formatters";
import {
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
  red: "oklch(0.55 0.22 25)",
};

const PIE_COLORS = [CHART_COLORS.gold, CHART_COLORS.teal, CHART_COLORS.green, CHART_COLORS.amber, CHART_COLORS.red, "oklch(0.60 0.12 270)"];

export default function CasinoPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [liveCasinoKPIs, setLiveCasinoKPIs] = useState<typeof baseCasinoKPIs | null>(null);

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
  }, [filters.dateFrom, filters.dateTo]);

  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const casinoProviders = useMemo(
    () =>
      scaleArrayNumericFields(baseCasinoProviders, multiplier, ["provider", "casinoType"]),
    [multiplier],
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
  return (
    <DashboardLayout title="Casino & Games" subtitle="Provider performance, virtual games, and casino revenue"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Casino Stake" value={`${formatCompact(casinoKPIs.totalStake)}`} subtitle="All providers" change={18.4} changeLabel="vs last month" icon={<DollarSign size={18} />} accent="gold" />
        <KpiCard title="Total Winnings" value={`${formatCompact(casinoKPIs.totalWinnings)}`} subtitle="Paid to players" change={16.2} changeLabel="vs last month" icon={<TrendingUp size={18} />} accent="amber" />
        <KpiCard title="Gross Profit" value={`${formatCompact(casinoKPIs.grossProfit)}`} subtitle="Stake minus winnings" change={22.1} changeLabel="vs last month" icon={<Gamepad2 size={18} />} accent="green" />
        <KpiCard title="Casino Margin" value={`${casinoKPIs.margin}%`} subtitle="House edge" change={0.4} changeLabel="vs last month" icon={<Percent size={18} />} accent="teal" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Provider bar chart */}
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Revenue by Provider</h3>
          <p className="text-xs text-white/40 mb-4">Gross profit per casino provider</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={casinoProviders} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="provider" tick={{ fill: "oklch(0.65 0.02 0)", fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip formatter={(v: number) => [`${formatCompact(v)}`, "Profit"]} contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} />
              <Bar dataKey="profit" fill={CHART_COLORS.gold} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Provider share pie */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Stake Share</h3>
          <p className="text-xs text-white/40 mb-4">By provider</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={casinoProviders} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="stake" nameKey="provider" paddingAngle={2}>
                {casinoProviders.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => `${formatCompact(v)}`} contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {casinoProviders.map((p, i) => (
              <div key={p.provider} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-white/50 truncate max-w-[100px]">{p.provider}</span>
                </div>
                <span className="text-white/60 font-mono text-xs">
                  {(p.stake / totalStakeSafe * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Provider table */}
      <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <h3 className="text-sm font-semibold text-white mb-1">Provider Detail</h3>
        <p className="text-xs text-white/40 mb-4">view_CasinoBets — all providers</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Provider", "Type", "Total Bets", "Stake", "Winnings", "Gross Profit", "Margin"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {casinoProviders.map((p) => (
                <tr key={p.provider} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-4 text-white/80 font-medium">{p.provider}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs">{p.casinoType}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono">{formatCompact(p.bets)}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono">{ formatCompact(p.stake)}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono">{ formatCompact(p.winnings)}</td>
                  <td className="py-2.5 pr-4 text-xs font-mono font-semibold" style={{color: CHART_COLORS.gold }}>{ formatCompact(p.profit)}</td>
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
