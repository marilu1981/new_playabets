import { useEffect, useState } from "react";
/**
 * PLAYA BETS — Transactions Page
 * Live data from /transactions/kpis and /transactions/trend
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DollarSign, ArrowUpCircle, ArrowDownCircle, Clock, CheckCircle, Users } from "lucide-react";
import { formatCompact, formatFull } from "@/lib/formatters";
import { cachedFetch } from "@/lib/apiCache";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const COLORS = { green: "#7ab800", amber: "#ffb500", red: "#d94040", teal: "#0d8f8f" };
const CARD_BG = { background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" };
const TT_STYLE = { background: "#fff", border: "1px solid #e4ece4", fontSize: 11 };

interface TxKpis {
  deposits: number; withdrawals: number; net_deposits: number;
  tx_count: number; unique_depositors: number;
  tx_count_accepted: number; tx_count_pending: number; tx_count_other_status: number;
  has_data: boolean; disabled: boolean;
}
interface TrendPoint { date: string; value: number; }

export default function TransactionsPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [kpis, setKpis]       = useState<TxKpis | null>(null);
  const [depTrend, setDepTrend] = useState<TrendPoint[]>([]);
  const [wdTrend, setWdTrend]   = useState<TrendPoint[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
    Promise.allSettled([
      fetchJson<TxKpis>(`/transactions/kpis?${query}`),
      fetchJson<{ has_data: boolean; deposits: TrendPoint[]; withdrawals: TrendPoint[] }>(`/transactions/trend?${query}`),
    ]).then(([kpisRes, trendRes]) => {
      if (kpisRes.status === "fulfilled") setKpis(kpisRes.value);
      if (trendRes.status === "fulfilled" && trendRes.value.has_data) {
        setDepTrend(trendRes.value.deposits ?? []);
        setWdTrend(trendRes.value.withdrawals ?? []);
      }
      setLoading(false);
    });
  }, [filters.dateFrom, filters.dateTo]);

  const trendData = depTrend.map((d, i) => ({
    date: d.date,
    deposits: d.value,
    withdrawals: wdTrend[i]?.value ?? 0,
    net: d.value - (wdTrend[i]?.value ?? 0),
  }));

  const dash = loading ? "…" : "—";
  const pending = !kpis?.has_data;

  return (
    <DashboardLayout title="Transactions" subtitle="Deposits, withdrawals, and financial flows"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>

      {/* KPI Row */}
      <div className="rounded-xl p-5 mb-6" style={CARD_BG}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard title="Total Deposits"   value={kpis?.has_data ? formatFull(kpis.deposits)    : pending ? "Pending" : dash} icon={<ArrowUpCircle size={18} />}   accent="green" loading={loading} />
          <KpiCard title="Total Withdrawals" value={kpis?.has_data ? formatFull(kpis.withdrawals) : pending ? "Pending" : dash} icon={<ArrowDownCircle size={18} />} accent="amber" loading={loading} />
          <KpiCard title="Net Cash"         value={kpis?.has_data ? formatFull(kpis.net_deposits) : pending ? "Pending" : dash} icon={<DollarSign size={18} />}      accent="teal"  loading={loading} />
          <KpiCard title="Unique Depositors" value={kpis?.has_data ? kpis.unique_depositors.toLocaleString() : dash} icon={<Users size={18} />}        accent="gold"  loading={loading} />
          <KpiCard title="Pending Tx"       value={kpis?.has_data ? kpis.tx_count_pending.toLocaleString()   : dash} icon={<Clock size={18} />}         accent="red"   loading={loading} />
          <KpiCard title="Accepted Tx"      value={kpis?.has_data ? kpis.tx_count_accepted.toLocaleString()  : dash} icon={<CheckCircle size={18} />}    accent="teal"  loading={loading} />
        </div>
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Deposits vs Withdrawals</h3>
          <p className="text-xs text-gray-400 mb-4">Daily flow — selected period</p>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="withGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.amber} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.amber} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatCompact(v)} axisLine={false} tickLine={false} width={60} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatFull(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="deposits"    name="Deposits"    stroke={COLORS.green} fill="url(#depGrad)"  strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="withdrawals" name="Withdrawals" stroke={COLORS.amber} fill="url(#withGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">
              {loading ? "Loading…" : "No transaction trend data available for this period"}
            </div>
          )}
        </div>

        <div className="rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Net Cash Flow</h3>
          <p className="text-xs text-gray-400 mb-4">Daily net (Deposits − Withdrawals)</p>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData.slice(-14)} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(8)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatCompact(v)} axisLine={false} tickLine={false} width={55} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => formatFull(v)} />
                <Bar dataKey="net" name="Net Flow" fill={COLORS.teal} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">
              {loading ? "Loading…" : "No data"}
            </div>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {kpis?.has_data && (
        <div className="rounded-xl p-5" style={CARD_BG}>
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Transaction Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg p-3" style={{ background: "#f5f9f5", border: "1px solid #dde8dd" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Net Cash %</div>
              <div className="text-sm font-bold text-gray-900">{kpis.deposits > 0 ? `${((kpis.net_deposits / kpis.deposits) * 100).toFixed(1)}%` : "—"}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "#f5f9f5", border: "1px solid #dde8dd" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Avg Deposit / User</div>
              <div className="text-sm font-bold text-gray-900">{kpis.unique_depositors > 0 ? formatFull(kpis.deposits / kpis.unique_depositors) : "—"}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "#f5f9f5", border: "1px solid #dde8dd" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Total Transactions</div>
              <div className="text-sm font-bold text-gray-900">{kpis.tx_count.toLocaleString()}</div>
            </div>
            <div className="rounded-lg p-3" style={{ background: "#f5f9f5", border: "1px solid #dde8dd" }}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Other Status</div>
              <div className="text-sm font-bold text-gray-900">{kpis.tx_count_other_status.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
