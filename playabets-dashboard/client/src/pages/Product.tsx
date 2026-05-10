/**
 * PLAYA BETS — Product Dashboard
 * Performance analysis across Sports Betting, Casino, and Horse Racing verticals.
 */
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCompact, formatFull } from "@/lib/formatters";
import { cachedFetch } from "@/lib/apiCache";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const CARD_BG = { background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const TT_STYLE = { background: "#fff", border: "1px solid #e4ece4", borderRadius: 8, fontSize: 11 };

const COLORS = { sports: "#7ab800", casino: "#ffb500", horseRacing: "#0d8f8f" };

interface VerticalMetrics {
  ggr: number;
  turnover: number;
  actives: number;
  bets: number;
  hold_pct: number;
  avg_bet: number;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "#f5f9f5", border: "1px solid #dde8dd" }}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className="text-sm font-bold text-gray-900">{value}</div>
      {sub && <div className="text-[8px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function VerticalSection({ title, color, metrics, loading }: {
  title: string; color: string; metrics: VerticalMetrics | null; loading: boolean;
}) {
  const v = metrics;
  const dash = loading ? "…" : "—";
  return (
    <div className="rounded-xl p-5" style={CARD_BG}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full" style={{ background: color }} />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <MetricCard label="GGR"          value={v ? formatFull(v.ggr)       : dash} />
        <MetricCard label="Turnover"     value={v ? formatFull(v.turnover)  : dash} />
        <MetricCard label="Active Players" value={v ? formatCompact(v.actives) : dash} sub="period unique" />
        <MetricCard label="Bets"         value={v ? formatCompact(v.bets)   : dash} />
        <MetricCard label="Avg Bet Size" value={v && v.bets > 0 ? formatFull(v.avg_bet) : dash} />
        <MetricCard label="Hold %"       value={v ? `${v.hold_pct.toFixed(2)}%` : dash} sub="GGR÷Turnover" />
      </div>
    </div>
  );
}

export default function ProductPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [sports, setSports]   = useState<VerticalMetrics | null>(null);
  const [casino, setCasino]   = useState<VerticalMetrics | null>(null);
  const [horses, setHorses]   = useState<VerticalMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
    Promise.allSettled([
      fetchJson<{ current?: Record<string, number> }>(`/kpis/summary?${query}`),
      fetchJson<Record<string, number>>(`/kpis?${query}`),
    ]).then(([summaryRes, kpisRes]) => {
      const s = summaryRes.status === "fulfilled" ? (summaryRes.value?.current ?? null) : null;
      const k = kpisRes.status === "fulfilled" ? kpisRes.value : null;
      const src: Record<string, number> = { ...(k ?? {}), ...(s ?? {}) };

      const sportsTurn  = Number(src.sports_turnover ?? 0);
      const sportsGgr   = Number(src.sports_ggr ?? 0);
      const sportsBets  = Number(src.sports_bets ?? 0);
      const sportsAct   = Number(src.sports_actives ?? src.actives_sports ?? 0);
      setSports({
        ggr: sportsGgr, turnover: sportsTurn, actives: sportsAct, bets: sportsBets,
        hold_pct: sportsTurn > 0 ? (sportsGgr / sportsTurn) * 100 : 0,
        avg_bet: sportsBets > 0 ? sportsTurn / sportsBets : 0,
      });

      const casinoTurn  = Number(src.casino_stake ?? 0);
      const casinoGgr   = Number(src.casino_ggr ?? 0);
      const casinoBets  = Number(src.casino_bets ?? 0);
      const casinoAct   = Number(src.casino_actives ?? 0);
      setCasino({
        ggr: casinoGgr, turnover: casinoTurn, actives: casinoAct, bets: casinoBets,
        hold_pct: casinoTurn > 0 ? (casinoGgr / casinoTurn) * 100 : 0,
        avg_bet: casinoBets > 0 ? casinoTurn / casinoBets : 0,
      });

      const hrTurn = Number(src.horse_racing_stake ?? 0);
      const hrGgr  = Number(src.horse_racing_ggr ?? 0);
      const hrBets = Number(src.horse_racing_bets ?? 0);
      const hrAct  = Number(src.horse_racing_actives ?? 0);
      setHorses({
        ggr: hrGgr, turnover: hrTurn, actives: hrAct, bets: hrBets,
        hold_pct: hrTurn > 0 ? (hrGgr / hrTurn) * 100 : 0,
        avg_bet: hrBets > 0 ? hrTurn / hrBets : 0,
      });

      setLoading(false);
    });
  }, [filters.dateFrom, filters.dateTo]);

  const chartData = [
    { name: "Sports", GGR: sports?.ggr ?? 0, Turnover: sports?.turnover ?? 0 },
    { name: "Casino", GGR: casino?.ggr ?? 0, Turnover: casino?.turnover ?? 0 },
    { name: "Horse Racing", GGR: horses?.ggr ?? 0, Turnover: horses?.turnover ?? 0 },
  ];

  return (
    <DashboardLayout
      title="Product Dashboard"
      subtitle="Performance analysis across Sports Betting, Casino, and Horse Racing verticals"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}
    >
      <div className="flex flex-col gap-4">
        <VerticalSection title="Sports Betting"  color={COLORS.sports}      metrics={sports}  loading={loading} />
        <VerticalSection title="Casino"          color={COLORS.casino}      metrics={casino}  loading={loading} />
        <VerticalSection title="Horse Racing"    color={COLORS.horseRacing} metrics={horses}  loading={loading} />

        {/* Comparison chart */}
        <div className="rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">GGR & Turnover by Vertical</h3>
          <p className="text-xs text-gray-500 mb-4">Selected period comparison</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatFull(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="GGR"      fill={COLORS.sports}      radius={[3, 3, 0, 0]} />
              <Bar dataKey="Turnover" fill={COLORS.casino}      radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DashboardLayout>
  );
}
