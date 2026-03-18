import type { CSSProperties } from "react";
import { Activity, ArrowUpRight, BarChart2, DollarSign, Download, Percent, TrendingUp, UserPlus, Users, Zap } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import KpiCard from "@/components/KpiCard";
import MockOverlay from "@/components/MockOverlay";
import { formatCompact } from "@/lib/formatters";
import { fmtMetric, pctChange, type DataMode, type MetricRow } from "./homeUtils";

type ChartColors = Record<string, string>;

type SectionStyleProps = {
  cardBg: CSSProperties;
  fontSerif: CSSProperties;
  fontMono: CSSProperties;
  chartColors: ChartColors;
  ttStyle: CSSProperties;
};

type OverviewLike = {
  activeUsers: number;
  totalStake: number;
  grossRevenue: number;
};

type TransactionSummaryLike = {
  totalDeposits: number;
  totalWithdrawals: number;
};

export function HomeHeroBanner({
  heroBg,
  filters,
  granularityLabel,
  latestDataDate,
  dataMode,
  pendingDataItems,
  chartColors,
  fontSerif,
}: {
  heroBg: string;
  filters: { dateFrom: string; dateTo: string };
  granularityLabel: string;
  latestDataDate: string | null;
  dataMode: DataMode;
  pendingDataItems: string[];
  chartColors: ChartColors;
  fontSerif: CSSProperties;
}) {
  return (
    <div
      className="relative rounded-xl overflow-hidden mb-6 p-6"
      style={{ backgroundImage: `url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center 40%", minHeight: "130px" }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
      <div className="relative z-10">
        <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: chartColors.gold }}>
          Playa Bets Analytics
        </div>
        <h2 className="text-2xl font-bold text-white mb-1" style={fontSerif}>
          Gaming Activity Dashboard
        </h2>
        <p className="text-sm text-white/60 max-w-lg">
          Executive KPI Analytics — {filters.dateFrom} to {filters.dateTo} · {granularityLabel} view
        </p>
        {latestDataDate && (
          <p className="text-xs text-white/45 mt-1">Data available through {latestDataDate}</p>
        )}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "oklch(0.75 0.17 145)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            DWH Connected ({dataMode === "live" ? "Live" : dataMode === "partial" ? "Partial Live" : "Mock"})
          </div>
          <div className="text-xs text-white/40">Last refresh: just now</div>
        </div>
        {dataMode !== "mock" && (
          <div className="text-xs text-white/45 mt-2">
            Pending: {pendingDataItems.join(", ")}.
          </div>
        )}
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
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-3 mb-3">
        <KpiCard title="Registrations" value={formatCompact(kpiRegistrations)} subtitle="Selected range" icon={<UserPlus size={18} />} accent="teal" loading={isLoading} />
        <KpiCard title="FTDs" value={formatCompact(kpiFtds)} subtitle="First-time depositors" icon={<Users size={18} />} accent="gold" loading={isLoading} />
        <KpiCard title="Actives" value={formatCompact(overviewKpis.activeUsers)} subtitle="Sports + Casino actives" icon={<Activity size={18} />} accent="green" loading={isLoading} />
        <KpiCard
          title="Total Deposits"
          value={hasTransactionsData ? `${formatCompact(transactionSummary.totalDeposits)}` : "Pending"}
          subtitle={hasTransactionsData ? "Gross deposits" : "Transactions export pending"}
          icon={<DollarSign size={18} />}
          accent="amber"
          loading={isLoading}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <KpiCard
          title="Total Withdrawals"
          value={hasTransactionsData ? `${formatCompact(transactionSummary.totalWithdrawals)}` : "Pending"}
          subtitle={hasTransactionsData ? "Paid out" : "Transactions export pending"}
          icon={<ArrowUpRight size={18} />}
          accent="red"
          loading={isLoading}
        />
        <KpiCard title="Total Turnover" value={`${formatCompact(overviewKpis.totalStake)}`} subtitle="Sports + Casino" icon={<TrendingUp size={18} />} accent="teal" loading={isLoading} />
        <KpiCard title="GGR" value={`${formatCompact(overviewKpis.grossRevenue)}`} subtitle={`Sports + Casino · ${margin}% margin`} icon={<BarChart2 size={18} />} accent="gold" loading={isLoading} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard title="NGR" value={ngrCardValue} subtitle={ngrCardSubtitle} icon={<Percent size={18} />} accent="green" loading={isLoading} />
        <KpiCard title="Top_FTDs (TBC from RFM)" value="TBC" valueClassName="text-white/35" subtitle="High-value FTDs" icon={<Zap size={18} />} accent="gold" loading={isLoading} />
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
  cardBg,
  chartColors,
  fontSerif,
  fontMono,
}: {
  summaryTab: "overview" | "sport" | "casino" | "all";
  setSummaryTab: (tab: "overview" | "sport" | "casino" | "all") => void;
  summaryRows: MetricRow[];
  exportFilename: string;
} & Pick<SectionStyleProps, "cardBg" | "chartColors" | "fontSerif" | "fontMono">) {
  return (
    <div className="rounded-xl p-5 mb-4" style={cardBg}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white" style={fontSerif}>Summary Metrics</h3>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Mock Data - TBC</span>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
          style={{ background: chartColors.green, color: "white" }}
          onClick={() => {
            const csv = ["Metric,Current Period,Previous Period,Change %,YTD",
              ...summaryRows.map((r) => `${r.metric},${fmtMetric(r.current, r)},${fmtMetric(r.previous, r)},${pctChange(r.current, r.previous)}%,${fmtMetric(r.ytd, r)}`),
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
      <div className="flex gap-1 mb-4 border-b" style={{ borderColor: "oklch(1 0 0 / 8%)" }}>
        {([
          { key: "overview", label: "Overview" },
          { key: "sport", label: "Sport Details" },
          { key: "casino", label: "Casino Details" },
          { key: "all", label: "All Metrics" },
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
            <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
              {["Metric", "Current Period", "Previous Period", "Change %", "YTD"].map((h) => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider pb-2 pr-4 whitespace-nowrap" style={{ color: "oklch(0.45 0.01 155)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => {
              const chg = pctChange(row.current, row.previous);
              return (
                <tr key={row.metric} className="hover:bg-white/2 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-4 text-white/80 text-xs font-medium">{row.metric}</td>
                  <td className="py-2.5 pr-4 text-white text-xs font-mono" style={fontMono}>{fmtMetric(row.current, row)}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono" style={fontMono}>{fmtMetric(row.previous, row)}</td>
                  <td className="py-2.5 pr-4 text-xs font-semibold font-mono" style={{ ...fontMono, color: chg >= 0 ? chartColors.green : chartColors.red }}>
                    {chg >= 0 ? "+" : ""}{chg}%
                  </td>
                  <td className="py-2.5 text-white/60 text-xs font-mono" style={fontMono}>{fmtMetric(row.ytd, row)}</td>
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
            <span className="text-white/70 font-mono text-xs" style={fontMono}>{formatCompact(row.count)}</span>
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
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">Mock Data - TBC</span>
          </div>
          <p className="text-xs text-white/40">Date · Brand · Segment · Territory · Value · % Change</p>
        </div>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
          style={{ background: chartColors.teal, color: "white" }}
          onClick={() => {
            const csv = ["Date,Brand,Segment,Territory,Value,% Change",
              ...detailedBreakdown.map((r) => `${r.date},${r.brand},${r.segment},${r.territory},${formatCompact(r.value)},${r.pctChange >= 0 ? "+" : ""}${r.pctChange}%`),
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
            <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
              {["Date", "Brand", "Segment", "Territory", "Value", "% Change"].map((h) => (
                <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider pb-2 pr-6 whitespace-nowrap" style={{ color: "oklch(0.45 0.01 155)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detailedBreakdown.map((row, idx) => (
              <tr key={idx} className="hover:bg-white/2 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                <td className="py-2.5 pr-6 text-white/50 text-xs font-mono" style={fontMono}>{row.date}</td>
                <td className="py-2.5 pr-6 text-white/80 text-xs font-medium">{row.brand}</td>
                <td className="py-2.5 pr-6">
                  <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{
                    background: row.segment === "VIP" ? "oklch(0.72 0.14 85 / 15%)" : row.segment === "PVIP" ? "oklch(0.65 0.15 195 / 15%)" : row.segment === "Mass" ? "oklch(0.62 0.17 145 / 15%)" : "oklch(0.72 0.17 60 / 15%)",
                    color: row.segment === "VIP" ? chartColors.gold : row.segment === "PVIP" ? chartColors.teal : row.segment === "Mass" ? chartColors.green : chartColors.amber,
                  }}>{row.segment}</span>
                </td>
                <td className="py-2.5 pr-6 text-white/60 text-xs">{row.territory}</td>
                <td className="py-2.5 pr-6 text-white text-xs font-mono" style={fontMono}>{formatCompact(row.value)}</td>
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
