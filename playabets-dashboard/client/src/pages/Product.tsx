/**
 * PLAYA BETS - Product Dashboard
 * Performance across Sports Betting, Casino, Horse Racing, and Lotto verticals.
 */
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import { usePersistedFilters } from "@/lib/usePersistedFilters";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { formatFull, formatCompact } from "@/lib/formatters";
import { aggregateByGranularity } from "./home/homeUtils";
import { cachedFetch } from "@/lib/apiCache";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const CARD_BG = { background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const TT_STYLE = { background: "#fff", border: "1px solid #e4ece4", borderRadius: 8, fontSize: 11 };

const COLORS = {
  sports: "#7ab800",
  casino: "#ffb500",
  horseRacing: "#0d8f8f",
  lotto: "#d94040",
};

interface VerticalMetrics {
  ggr: number; turnover: number; actives: number; bets: number;
  hold_pct: number; avg_bet: number;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "#f5f9f5", border: "1px solid #dde8dd" }}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className="text-sm font-bold text-gray-900 break-all">{value}</div>
      {sub && <div className="text-[8px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function VerticalSection({ title, color, metrics, loading }: {
  title: string; color: string; metrics: VerticalMetrics | null; loading: boolean;
}) {
  const v = metrics;
  const dash = loading ? "..." : "-";
  return (
    <div className="rounded-xl p-5" style={CARD_BG}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <MetricCard label="GGR"          value={v ? formatFull(v.ggr)            : dash} />
        <MetricCard label="Turnover"     value={v ? formatFull(v.turnover)       : dash} />
        <MetricCard label="Active Players" value={v ? v.actives.toLocaleString() : dash} sub="period unique" />
        <MetricCard label="Bets"         value={v ? v.bets.toLocaleString()      : dash} />
        <MetricCard label="Avg Bet Size" value={v && v.bets > 0 ? formatFull(v.avg_bet) : dash} />
        <MetricCard label="Hold %"       value={v ? `${v.hold_pct.toFixed(2)}%`  : dash} sub="GGR/Turnover" />
      </div>
    </div>
  );
}

type Granularity = "daily" | "weekly" | "monthly";

export default function ProductPage() {
  const [filters, setFilters] = usePersistedFilters();
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [sports, setSports]   = useState<VerticalMetrics | null>(null);
  const [casino, setCasino]   = useState<VerticalMetrics | null>(null);
  const [horses, setHorses]   = useState<VerticalMetrics | null>(null);
  const [lotto, setLotto]     = useState<VerticalMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyPoints, setDailyPoints] = useState<Record<string, number>[]>([]);

  useEffect(() => {
    setLoading(true);
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
    Promise.allSettled([
      fetchJson<{ current?: Record<string, number> }>(`/kpis/summary?${query}`),
      fetchJson<Record<string, number>>(`/kpis?${query}`),
      fetchJson<{ points: Record<string, number>[] }>(`/product/daily?${query}`),
    ]).then(([summaryRes, kpisRes, dailyRes]) => {
      const s = summaryRes.status === "fulfilled" ? (summaryRes.value?.current ?? null) : null;
      const k = kpisRes.status === "fulfilled" ? kpisRes.value : null;
      const src: Record<string, number> = { ...(k ?? {}), ...(s ?? {}) };

      if (dailyRes.status === "fulfilled") setDailyPoints(dailyRes.value?.points ?? []);

      const mk = (turn: number, ggr: number, act: number, bets: number): VerticalMetrics => ({
        ggr, turnover: turn, actives: act, bets,
        hold_pct: turn > 0 ? (ggr / turn) * 100 : 0,
        avg_bet: bets > 0 ? turn / bets : 0,
      });

      const st = Number(src.sports_turnover ?? 0);
      const sg = Number(src.sports_ggr ?? 0);
      setSports(mk(st, sg, Number(src.sports_actives ?? src.actives_sports ?? 0), Number(src.sports_bets ?? 0)));

      const ct = Number(src.casino_stake ?? 0);
      const cg = Number(src.casino_ggr ?? 0);
      setCasino(mk(ct, cg, Number(src.casino_actives ?? 0), Number(src.casino_bets ?? 0)));

      const ht = Number(src.horse_racing_stake ?? 0);
      const hg = Number(src.horse_racing_ggr ?? 0);
      setHorses(mk(ht, hg, Number(src.horse_racing_actives ?? 0), Number(src.horse_racing_bets ?? 0)));

      const lt = Number(src.lotto_stake ?? 0);
      const lg = Number(src.lotto_ggr ?? 0);
      setLotto(mk(lt, lg, Number(src.lotto_actives ?? 0), Number(src.lotto_bets ?? 0)));

      setLoading(false);
    });
  }, [filters.dateFrom, filters.dateTo]);

  const aggPoints = useMemo(() => {
    if (!dailyPoints.length) return [];
    return aggregateByGranularity(dailyPoints, granularity, (r) => String(r.date ?? ""), {
      labelKey: "date", fallbackYear: new Date(filters.dateTo).getFullYear(),
    });
  }, [dailyPoints, granularity, filters.dateTo]);

  const fmtFull = (v: number) => formatFull(v);
  const TABS: { key: Granularity; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
  ];

  function GranularityTabs() {
    return (
      <div className="flex gap-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setGranularity(t.key)}
            className="text-xs px-2.5 py-1 rounded font-medium transition-colors"
            style={granularity === t.key
              ? { background: "#7ab800", color: "#fff" }
              : { background: "rgba(122,184,0,0.10)", color: "#7ab800" }}>
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  function TrendChart({ title, lines }: { title: string; lines: { key: string; color: string; label: string }[] }) {
    return (
      <div className="rounded-xl p-5" style={CARD_BG}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <GranularityTabs />
        </div>
        <p className="text-xs text-gray-500 mb-3">Selected period - {granularity}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={aggPoints} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: unknown) => `${v}`.slice(5)} interval="preserveStartEnd" axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => formatCompact(v)} axisLine={false} tickLine={false} width={55} />
            <Tooltip contentStyle={TT_STYLE} formatter={(v: number, name: string) => [fmtFull(v), name]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {lines.map(l => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.label}
                stroke={l.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <DashboardLayout
      title="Product Dashboard"
      subtitle="Performance across Sports Betting, Casino, Horse Racing, and Lotto"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}
    >
      <div className="flex flex-col gap-4">
        <VerticalSection title="Sports Betting"  color={COLORS.sports}      metrics={sports}  loading={loading} />
        <VerticalSection title="Casino"          color={COLORS.casino}      metrics={casino}  loading={loading} />
        <VerticalSection title="Horse Racing"    color={COLORS.horseRacing} metrics={horses}  loading={loading} />
        <VerticalSection title="Lotto"           color={COLORS.lotto}       metrics={lotto}   loading={loading} />

        <TrendChart title="Daily GGR by Vertical" lines={[
          { key: "sports_ggr",       color: COLORS.sports,      label: "Sports GGR" },
          { key: "casino_ggr",       color: COLORS.casino,      label: "Casino GGR" },
          { key: "horse_racing_ggr", color: COLORS.horseRacing, label: "Horse Racing GGR" },
          { key: "lotto_ggr",        color: COLORS.lotto,       label: "Lotto GGR" },
        ]} />

        <TrendChart title="Daily Turnover by Vertical" lines={[
          { key: "sports_turnover",       color: COLORS.sports,      label: "Sports" },
          { key: "casino_turnover",       color: COLORS.casino,      label: "Casino" },
          { key: "horse_racing_turnover", color: COLORS.horseRacing, label: "Horse Racing" },
          { key: "lotto_turnover",        color: COLORS.lotto,       label: "Lotto" },
        ]} />

        <TrendChart title="Avg Bet Size by Vertical" lines={[
          { key: "sports_avg_bet",       color: COLORS.sports,      label: "Sports" },
          { key: "casino_avg_bet",       color: COLORS.casino,      label: "Casino" },
          { key: "horse_racing_avg_bet", color: COLORS.horseRacing, label: "Horse Racing" },
        ]} />

        <TrendChart title="Hold % by Vertical" lines={[
          { key: "sports_hold",       color: COLORS.sports,      label: "Sports Hold %" },
          { key: "casino_hold",       color: COLORS.casino,      label: "Casino Hold %" },
          { key: "horse_racing_hold", color: COLORS.horseRacing, label: "Horse Racing Hold %" },
        ]} />
      </div>
    </DashboardLayout>
  );
}
