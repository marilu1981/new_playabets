import type { CSSProperties } from "react";
import { Activity, ArrowUpRight, BarChart2, DollarSign, Download, Percent, TrendingUp, UserPlus, Users, Zap } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import KpiCard from "@/components/KpiCard";
import MockOverlay from "@/components/MockOverlay";
import { formatCompact, formatFull } from "@/lib/formatters";
import { fmtMetric, isPctChangeReliable, pctChange, type DataMode, type MetricRow } from "./homeUtils";

type ChartColors = Record<string, string>;

type SectionStyleProps = {
  cardBg: CSSProperties;
  fontSerif: CSSProperties;
  fontMono: CSSProperties;
  chartColors: ChartColors;
  ttStyle: CSSProperties;
};

type OverviewLike = {
  activesSports: number;
  activesCasino: number;
  totalStake: number;
  grossRevenue: number;
};

type TransactionSummaryLike = {
  totalDeposits: number;
  totalWithdrawals: number;
};

export function HomeHeroBanner({
  filters,
  granularityLabel,
  latestDataDate,
  dataMode,
  pendingDataItems,
  chartColors,
}: {
  filters: { dateFrom: string; dateTo: string };
  granularityLabel: string;
  latestDataDate: string | null;
  dataMode: DataMode;
  pendingDataItems: string[];
  chartColors: ChartColors;
}) {
  return (
    <div
      className="relative rounded-xl overflow-hidden mb-6 p-6"
      style={{
        background: "linear-gradient(135deg, #093508 0%, #1a4a10 50%, #7ab800 100%)",
        minHeight: "130px",
      }}
    >
      {/* subtle diagonal pattern overlay */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: "repeating-linear-gradient(45deg, #ffffff 0, #ffffff 1px, transparent 0, transparent 50%)",
        backgroundSize: "12px 12px",
      }} />
      <div className="relative z-10">
        <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#ffb500" }}>
          Playa Bets Analytics
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">
          Gaming Activity Dashboard
        </h2>
        <p className="text-sm mb-0" style={{ color: "rgba(255,255,255,0.70)" }}>
          Executive KPI Analytics — {filters.dateFrom} to {filters.dateTo} · {granularityLabel} view
        </p>
        {latestDataDate && (
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.50)" }}>Data available through {latestDataDate}</p>
        )}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#7ab800" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {dataMode === "live" ? "Data Connected" : dataMode === "partial" ? "Partial Live" : "Mock Data"}
          </div>
          <div className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>Last refresh: {latestDataDate ?? "…"}</div>
        </div>
      </div>
    </div>
  );
}

export function HomePrimaryKpis({
  overviewKpis,
  transactionSummary,
  kpiRegistrations,
  kpiFtds,
  hasTransactionsData,
  ngrCardValue,
  ngrCardSubtitle,
  periodConvRate,
  isLoading,
  chartColors,
}: {
  overviewKpis: OverviewLike;
  transactionSummary: TransactionSummaryLike;
  kpiRegistrations: number;
  kpiFtds: number;
  hasTransactionsData: boolean;
  ngrCardValue: string;
  ngrCardSubtitle: string;
  periodConvRate: number;
  isLoading: boolean;
  chartColors: ChartColors;
}) {
  const margin = overviewKpis.totalStake > 0
    ? ((overviewKpis.grossRevenue / overviewKpis.totalStake) * 100).toFixed(1)
    : "0.0";

  return (
    <>
      <div className="mb-2">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: chartColors.gold }}>
          Primary KPIs
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 xl:grid-cols-5 gap-3 mb-3">
        <KpiCard title="Registrations" value={formatFull(kpiRegistrations)} subtitle="Selected range" icon={<UserPlus size={18} />} accent="teal" loading={isLoading} />
        <KpiCard title="FTDs" value={formatFull(kpiFtds)} subtitle="First-time depositors" icon={<Users size={18} />} accent="gold" loading={isLoading} />
        <KpiCard title="Sports Actives" value={formatFull(overviewKpis.activesSports)} subtitle="Unique sports users" icon={<Activity size={18} />} accent="green" loading={isLoading} />
        <KpiCard title="Casino Actives" value={formatFull(overviewKpis.activesCasino)} subtitle="Unique casino users" icon={<Activity size={18} />} accent="gold" loading={isLoading} />
        <KpiCard
          title="Total Deposits"
          value={hasTransactionsData ? formatFull(transactionSummary.totalDeposits) : "Pending"}
          subtitle={hasTransactionsData ? "Gross deposits" : "Transactions export pending"}
          icon={<DollarSign size={18} />}
          accent="amber"
          loading={isLoading}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <KpiCard
          title="Total Withdrawals"
          value={hasTransactionsData ? formatFull(transactionSummary.totalWithdrawals) : "Pending"}
          subtitle={hasTransactionsData ? "Paid out" : "Transactions export pending"}
          icon={<ArrowUpRight size={18} />}
          accent="red"
          loading={isLoading}
        />
        <KpiCard title="Total Turnover" value={formatFull(overviewKpis.totalStake)} subtitle="Sports + Casino" icon={<TrendingUp size={18} />} accent="teal" loading={isLoading} />
        <KpiCard title="GGR" value={formatFull(overviewKpis.grossRevenue)} subtitle={`Sports + Casino · ${margin}% margin`} icon={<BarChart2 size={18} />} accent="gold" loading={isLoading} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard title="NGR" value={ngrCardValue} subtitle={ngrCardSubtitle} icon={<Percent size={18} />} accent="green" loading={isLoading} />
        <KpiCard title="Conversion Rate" value={`${periodConvRate}%`} subtitle="Reg → FTD" icon={<Percent size={18} />} accent="amber" loading={isLoading} />
      </div>
    </>
  );
}

export function SummaryMetricsTable({
  summaryTab,
  setSummaryTab,
  summaryRows,
  exportFilename,
  isLive = false,
  cardBg,
  chartColors,
  fontSerif,
  fontMono,
}: {
  summaryTab: "overview" | "sport" | "casino";
  setSummaryTab: (tab: "overview" | "sport" | "casino") => void;
  summaryRows: MetricRow[];
  exportFilename: string;
  isLive?: boolean;
} & Pick<SectionStyleProps, "cardBg" | "chartColors" | "fontSerif" | "fontMono">) {
  return (
    <div className="rounded-xl p-5 mb-4" style={cardBg}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white" style={fontSerif}>Summary Metrics</h3>
          {!isLive && <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400">Mock Data</span>}
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
          style={{ background: chartColors.green, color: "white" }}
          onClick={() => {
            const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
            const csv = ["Metric,Current Period,Previous Period,Change %,YTD",
              ...summaryRows.map((r) => [esc(r.metric), esc(fmtMetric(r.current, r)), esc(fmtMetric(r.previous, r)), `${pctChange(r.current, r.previous)}%`, esc(fmtMetric(r.ytd, r))].join(",")),
            ].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = exportFilename;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={12} />
          Export to Excel
        </button>
      </div>
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "#dde8dd" }}>
        {([
          { key: "overview", label: "Overview" },
          { key: "sport", label: "Sport Details" },
          { key: "casino", label: "Casino Details" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSummaryTab(key)}
            className="px-4 py-2 text-xs font-semibold transition-colors relative"
            style={{
              color: summaryTab === key ? chartColors.gold : "oklch(0.55 0.01 155)",
              borderBottom: summaryTab === key ? `2px solid ${chartColors.gold}` : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #dde8dd" }}>
              {["Metric", "Current Period", "Previous Period", "Change %", "YTD"].map((h) => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider pb-2 pr-4 whitespace-nowrap" style={{ color: "#666666" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => {
              const chg = pctChange(row.current, row.previous);
              const reliable = isPctChangeReliable(row.current, row.previous);
              return (
                <tr key={row.metric} className="hover:bg-gray-50 transition-colors" style={{ borderBottom: "1px solid #eef3ee" }}>
                  <td className="py-2.5 pr-4 text-gray-700 text-xs font-medium">{row.metric}</td>
                  <td className="py-2.5 pr-4 text-gray-900 text-xs font-mono" style={fontMono}>{fmtMetric(row.current, row)}</td>
                  <td className={`py-2.5 pr-4 text-xs font-mono ${reliable ? "text-gray-500" : "text-gray-300"}`} style={fontMono}>
                    {reliable ? fmtMetric(row.previous, row) : "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-xs font-semibold font-mono" style={{ ...fontMono, color: reliable ? (chg >= 0 ? chartColors.green : chartColors.red) : "oklch(0.45 0.01 155)" }}>
                    {reliable ? `${chg >= 0 ? "+" : ""}${chg}%` : "—"}
                  </td>
                  <td className="py-2.5 text-gray-500 text-xs font-mono" style={fontMono}>{fmtMetric(row.ytd, row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUS_COLORS = ["oklch(0.62 0.17 145)", "oklch(0.55 0.22 25)", "oklch(0.72 0.17 60)", "oklch(0.65 0.15 195)", "#6b7280"];

function StatusPiePanel({
  title,
  rows,
  pending,
  description,
  liveLabel,
  cardBg,
  chartColors,
  fontSerif,
  fontMono,
  ttStyle,
}: {
  title: string;
  rows: Array<{ status: string; count: number }>;
  pending: boolean;
  description: string;
  liveLabel: string;
} & SectionStyleProps) {
  return (
    <div className="relative rounded-xl p-5" style={cardBg}>
      <MockOverlay active={pending} description={description} />
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white" style={fontSerif}>{title}</h3>
          <p className="text-xs text-white/40">Distribution by status</p>
        </div>
        {pending ? (
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.65 0.15 195 / 15%)", color: chartColors.teal }}>
            Mock
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "oklch(0.62 0.17 145 / 15%)", color: chartColors.green }}>
            {liveLabel}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={rows} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="count" nameKey="status" paddingAngle={2}>
            {rows.map((_, i) => (
              <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatCompact(v)} contentStyle={ttStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5 mt-2">
        {rows.map((row, i) => (
          <div key={row.status} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
              <span className="text-white/60 truncate max-w-[110px]">{row.status}</span>
            </div>
            <span className="text-gray-700 font-mono text-xs" style={fontMono}>{formatCompact(row.count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusPiePanels({
  betslipsByStatus,
  usersByStatus,
  betslipStatusPending,
  userStatusPending,
  ...styles
}: {
  betslipsByStatus: Array<{ status: string; count: number }>;
  usersByStatus: Array<{ status: string; count: number }>;
  betslipStatusPending: boolean;
  userStatusPending: boolean;
} & SectionStyleProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <StatusPiePanel {...styles} title="Betslip Status" rows={betslipsByStatus} pending={betslipStatusPending} description="Betslip status pending live data" liveLabel="Live" />
      <StatusPiePanel {...styles} title="User Status" rows={usersByStatus} pending={userStatusPending} description="User status pending live data" liveLabel="Live" />
    </div>
  );
}

export function DetailedBreakdownTable({
  detailedBreakdown,
  exportFilename,
  cardBg,
  chartColors,
  fontSerif,
  fontMono,
}: {
  detailedBreakdown: Array<{ date: string; brand: string; segment: string; territory: string; value: number; pctChange: number }>;
  exportFilename: string;
} & Pick<SectionStyleProps, "cardBg" | "chartColors" | "fontSerif" | "fontMono">) {
  return (
    <div className="rounded-xl p-5" style={cardBg}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white" style={fontSerif}>Detailed Breakdown</h3>
            <span className="text-[10px] uppercase tracking-[0.2em] text-gray-400">Mock Data - TBC</span>
          </div>
          <p className="text-xs text-white/40">Date · Brand · Segment · Territory · Value · % Change</p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
          style={{ background: chartColors.teal, color: "white" }}
          onClick={() => {
            const esc2 = (v: string) => `"${v.replace(/"/g, '""')}"`;
            const csv = ["Date,Brand,Segment,Territory,Value,% Change",
              ...detailedBreakdown.map((r) => [esc2(r.date), esc2(r.brand), esc2(r.segment), esc2(r.territory), esc2(formatCompact(r.value)), `${r.pctChange >= 0 ? "+" : ""}${r.pctChange}%`].join(",")),
            ].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = exportFilename;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={12} />
          Export to Excel
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid #dde8dd" }}>
              {["Date", "Brand", "Segment", "Territory", "Value", "% Change"].map((h) => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider pb-2 pr-6 whitespace-nowrap" style={{ color: "#666666" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detailedBreakdown.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors" style={{ borderBottom: "1px solid #eef3ee" }}>
                <td className="py-2.5 pr-6 text-gray-500 text-xs font-mono" style={fontMono}>{row.date}</td>
                <td className="py-2.5 pr-6 text-gray-700 text-xs font-medium">{row.brand}</td>
                <td className="py-2.5 pr-6">
                  <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{
                    background:
                      row.segment === "Champions" ? "oklch(0.72 0.17 60 / 15%)" :
                      row.segment === "Loyal" ? "oklch(0.65 0.15 195 / 15%)" :
                      row.segment === "Big Spenders" ? "oklch(0.62 0.17 145 / 15%)" :
                      row.segment === "At Risk" ? "oklch(0.55 0.22 25 / 15%)" :
                      row.segment === "Dormant" ? "oklch(0.45 0.05 0 / 15%)" :
                      "oklch(0.72 0.14 85 / 15%)",
                    color:
                      row.segment === "Champions" ? chartColors.gold :
                      row.segment === "Loyal" ? chartColors.teal :
                      row.segment === "Big Spenders" ? chartColors.green :
                      row.segment === "At Risk" ? chartColors.red :
                      row.segment === "Dormant" ? "oklch(0.45 0.05 0)" :
                      chartColors.amber,
                  }}>{row.segment}</span>
                </td>
                <td className="py-2.5 pr-6 text-white/60 text-xs">{row.territory}</td>
                <td className="py-2.5 pr-6 text-gray-900 text-xs font-mono" style={fontMono}>{formatCompact(row.value)}</td>
                <td className="py-2.5 text-xs font-semibold font-mono" style={{ ...fontMono, color: row.pctChange >= 0 ? chartColors.green : chartColors.red }}>
                  {row.pctChange >= 0 ? "+" : ""}{row.pctChange}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
