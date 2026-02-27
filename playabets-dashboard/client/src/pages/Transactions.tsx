import { useMemo, useState } from "react";
/**
 * PLAYA BETS — Transactions Page
 * DWH Views: view_Transactions, view_TransactionTypes
 * Data source: mockData.ts (replace with API calls when VPN available)
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { DollarSign, ArrowUpCircle, ArrowDownCircle, Clock, CheckCircle } from "lucide-react";
import {
  transactionSummary as baseTransactionSummary,
  transactionsByReason as baseTransactionsByReason,
  transactionTrend as baseTransactionTrend,
} from "@/lib/mockData";
import { formatCompact, formatNumber } from "@/lib/formatters";
import {
  filterByDateRange,
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
  red: "oklch(0.55 0.22 25)",
};

export default function TransactionsPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const transactionTrend = useMemo(
    () =>
      scaleArrayNumericFields(
        filterByDateRange(baseTransactionTrend, filters, (row) => row.date),
        multiplier,
        ["date"],
      ),
    [filters, multiplier],
  );
  const transactionSummary = useMemo(() => {
    const scaled = scaleObjectNumericFields(baseTransactionSummary, multiplier);
    if (transactionTrend.length === 0) {
      return scaled;
    }
    const deposits = transactionTrend.reduce((sum, row) => sum + row.deposits, 0);
    const withdrawals = transactionTrend.reduce((sum, row) => sum + row.withdrawals, 0);
    return {
      ...scaled,
      totalDeposits: deposits,
      totalWithdrawals: withdrawals,
    };
  }, [multiplier, transactionTrend]);
  const transactionsByReason = useMemo(
    () => scaleArrayNumericFields(baseTransactionsByReason, multiplier, ["reason", "type"]),
    [multiplier],
  );
  return (
    <DashboardLayout title="Transactions" subtitle="Deposits, withdrawals, and financial flows"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Deposits" value={`${formatCompact(transactionSummary.totalDeposits)}`} subtitle="All time" change={11.2} changeLabel="vs last month" icon={<ArrowUpCircle size={18} />} accent="green" />
        <KpiCard title="Total Withdrawals" value={`${formatCompact(transactionSummary.totalWithdrawals)}`} subtitle="All time" change={8.4} changeLabel="vs last month" icon={<ArrowDownCircle size={18} />} accent="amber" />
        <KpiCard title="Pending" value={formatNumber(transactionSummary.pendingTransactions)} subtitle="Awaiting processing" icon={<Clock size={18} />} accent="red" />
        <KpiCard title="Accepted Today" value={formatNumber(transactionSummary.acceptedToday)} subtitle={`${transactionSummary.refusedToday} refused`} change={3.1} changeLabel="vs yesterday" icon={<CheckCircle size={18} />} accent="teal" />
      </div>

      {/* Transaction trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Deposits vs Withdrawals</h3>
          <p className="text-xs text-white/40 mb-4">Last 30 days daily flow</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={transactionTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.green} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="withGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.amber} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.amber} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} formatter={(v: number) => `${formatCompact(v)}`} />
              <Area type="monotone" dataKey="deposits" name="Deposits" stroke={CHART_COLORS.green} fill="url(#depGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="withdrawals" name="Withdrawals" stroke={CHART_COLORS.amber} fill="url(#withGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Net flow */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Net Cash Flow</h3>
          <p className="text-xs text-white/40 mb-4">Daily net (Deposits - Withdrawals)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={transactionTrend.slice(-14)} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 5%)" />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 9 }} tickFormatter={(v) => v.slice(8)} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "oklch(0.55 0.02 0)", fontSize: 10 }} tickFormatter={(v) => `${formatCompact(v)}`} axisLine={false} tickLine={false} width={55} />
              <Tooltip contentStyle={{ background: "oklch(0.22 0.04 155)", border: "1px solid oklch(1 0 0 / 10%)", fontSize: 11 }} formatter={(v: number) => `${formatCompact(v)}`} />
              <Bar dataKey="net" name="Net Flow" fill={CHART_COLORS.teal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transaction by reason */}
      <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <h3 className="text-sm font-semibold text-white mb-1">Transactions by Reason</h3>
        <p className="text-xs text-white/40 mb-4">view_Transactions — TransactionReasonId breakdown</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Reason", "Type", "Count", "Total Amount", "Avg Amount"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-6 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactionsByReason.map((t) => (
                <tr key={t.reason} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-3 pr-6 text-white/80 font-medium">{t.reason}</td>
                  <td className="py-3 pr-6">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{
                      background: t.type === "Positive" ? "oklch(0.62 0.17 145 / 15%)" : "oklch(0.55 0.22 25 / 15%)",
                      color: t.type === "Positive" ? "oklch(0.75 0.17 145)" : "oklch(0.70 0.18 25)",
                      border: `1px solid ${t.type === "Positive" ? "oklch(0.62 0.17 145 / 25%)" : "oklch(0.55 0.22 25 / 25%)"}`,
                    }}>
                      {t.type}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-white/50 font-mono text-xs">{formatCompact(t.count)}</td>
                  <td className="py-3 pr-6 font-mono text-xs" style={{color: CHART_COLORS.gold }}>{ formatCompact(t.amount)}</td>
                  <td className="py-3 text-white/50 font-mono text-xs">{ formatCompact(Math.round(t.amount / t.count))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
