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
interface ProviderDetailRow {
  provider: string;
  reason: string;
  transactions: number;
  amount: number;
  amount_type_id?: number;
}
interface ProviderTotals {
  transactions: number;
  positive_amount: number;
  negative_amount: number;
  total_amount: number;
}

export default function TransactionsPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [kpis, setKpis]         = useState<TxKpis | null>(null);
  const [depTrend, setDepTrend]  = useState<TrendPoint[]>([]);
  const [wdTrend, setWdTrend]    = useState<TrendPoint[]>([]);
  const [providerRows, setProviderRows] = useState<ProviderDetailRow[]>([]);
  const [providerTotals, setProviderTotals] = useState<ProviderTotals | null>(null);
  const [loading, setLoading]    = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
      setLoading(true);
      setDetailLoading(true);
      setKpis(null);
      setDepTrend([]);
      setWdTrend([]);
      setProviderRows([]);
      setProviderTotals(null);

      const [kpisRes, trendRes] = await Promise.allSettled([
        fetchJson<TxKpis>(`/transactions/kpis?${query}`),
        fetchJson<{ has_data: boolean; deposits: TrendPoint[]; withdrawals: TrendPoint[] }>(`/transactions/trend?${query}`),
      ]);

      if (cancelled) return;

      if (kpisRes.status === "fulfilled") setKpis(kpisRes.value);
      if (trendRes.status === "fulfilled" && trendRes.value.has_data) {
        setDepTrend(trendRes.value.deposits ?? []);
        setWdTrend(trendRes.value.withdrawals ?? []);
      }
      setLoading(false);

      withTimeout(fetchJson<{ has_data: boolean; rows: ProviderDetailRow[]; totals: ProviderTotals }>(`/transactions/providers?${query}`), 15000)
        .then((provRes) => {
          if (cancelled || !provRes?.has_data) return;
          setProviderRows(provRes.rows ?? []);
          setProviderTotals(provRes.totals ?? null);
        })
        .catch(() => {
          if (cancelled) return;
          setProviderRows([]);
          setProviderTotals(null);
        })
        .finally(() => {
          if (!cancelled) setDetailLoading(false);
        });
    }

    load().catch(() => {
      if (!cancelled) {
        setLoading(false);
        setDetailLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
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
        <div className="rounded-xl p-5 mb-6" style={CARD_BG}>
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

      {/* Totals + detail table */}
      <div className="rounded-xl p-5" style={CARD_BG}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Totals</h3>
          <button className="flex items-center gap-1 px-3 py-1 rounded-md border border-gray-300 text-xs text-gray-600 hover:bg-gray-50">
            Details <span className="text-gray-400">▾</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="rounded-lg p-3 border border-gray-200 bg-white">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-500">Transactions</div>
            <div className="text-2xl font-light text-sky-500 mt-1">{providerTotals ? providerTotals.transactions.toLocaleString() : "—"}</div>
          </div>
          <div className="rounded-lg p-3 border border-gray-200 bg-white">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Positive amount</div>
            <div className="text-2xl font-light text-emerald-600 mt-1">{providerTotals ? formatFull(providerTotals.positive_amount) : "—"} ZAR</div>
          </div>
          <div className="rounded-lg p-3 border border-gray-200 bg-white">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-red-500">Negative amount</div>
            <div className="text-2xl font-light text-red-500 mt-1">{providerTotals ? `-${formatFull(Math.abs(providerTotals.negative_amount))}` : "—"} ZAR</div>
          </div>
          <div className="rounded-lg p-3 border border-gray-200 bg-white">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-500">Total amount</div>
            <div className="text-2xl font-light text-sky-500 mt-1">{providerTotals ? formatFull(providerTotals.total_amount) : "—"} ZAR</div>
          </div>
        </div>

        {providerRows.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "#2f3338", color: "#fff" }}>
                  {["Provider", "Reason", "Transactions", "Amount"].map((h) => (
                    <th key={h} className={`px-3 py-2 font-semibold uppercase tracking-wider text-[10px] ${h === "Transactions" || h === "Amount" ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providerRows.map((row, i) => (
                  <tr key={`${row.provider}-${row.reason}-${row.amount_type_id ?? i}`} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", borderBottom: "1px solid #ececec" }}>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">
                        {row.provider}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-700">{row.reason}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600">{row.transactions.toLocaleString()}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${row.amount < 0 ? "text-red-500" : "text-emerald-600"}`}>
                      {row.amount < 0 ? `-${formatFull(Math.abs(row.amount))}` : formatFull(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-xs text-gray-400">
            {detailLoading ? "Loading…" : "No transaction detail data available for this period"}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
