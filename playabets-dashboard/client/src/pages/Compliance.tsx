import { useState } from "react";
/**
 * PLAYA BETS — Compliance & Audit Page
 * DWH Views: view_UsersSelfexclusions, view_ImportStatus, view_AuditLog
 * Data source: mockData.ts (replace with API calls when VPN available)
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import { ShieldCheck, AlertTriangle, UserX, Clock } from "lucide-react";
import { complianceKPIs, importStatus, selfExclusionSummary } from "@/lib/mockData";
import { formatNumber } from "@/lib/formatters";

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
  red: "oklch(0.55 0.22 25)",
};

export default function CompliancePage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  return (
    <DashboardLayout title="Compliance & Audit" subtitle="Responsible gaming, KYC, AML alerts, and import status"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Active Self-Exclusions" value={complianceKPIs.selfExclusionsActive} subtitle="Responsible gaming" change={3.2} changeLabel="vs last month" icon={<UserX size={18} />} accent="red" />
        <KpiCard title="Frozen Accounts" value={formatNumber(complianceKPIs.frozenAccounts)} subtitle="Requires review" icon={<ShieldCheck size={18} />} accent="teal" />
        <KpiCard title="Pending KYC" value={formatNumber(complianceKPIs.pendingKYC)} subtitle="Be Validated status" icon={<Clock size={18} />} accent="amber" />
        <KpiCard title="AML Alerts" value={complianceKPIs.amlAlerts} subtitle={`${complianceKPIs.flaggedTransactions} flagged txns`} icon={<AlertTriangle size={18} />} accent="gold" />
      </div>

      {/* Self-exclusion detail + Import status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Self-exclusion by period */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Self-Exclusion by Period</h3>
          <p className="text-xs text-white/40 mb-4">view_UsersSelfexclusions — active exclusions</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "In Progress", value: selfExclusionSummary.inProgress, color: CHART_COLORS.gold },
              { label: "Pending", value: selfExclusionSummary.pending, color: CHART_COLORS.amber },
              { label: "Completed", value: selfExclusionSummary.completed, color: CHART_COLORS.green },
            ].map((s) => (
              <div key={s.label} className="text-center p-3 rounded-lg" style={{ background: "oklch(0.22 0.04 155)" }}>
                <div className="text-xl font-bold mb-1" style={{color: s.color }}>{s.value}</div>
                <div className="text-xs text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {selfExclusionSummary.byPeriod.map((p) => (
              <div key={p.period} className="flex items-center justify-between">
                <span className="text-xs text-white/50 w-20">{p.period}</span>
                <div className="flex-1 mx-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(p.count / selfExclusionSummary.total) * 100}%`, background: CHART_COLORS.red }} />
                </div>
                <span className="text-xs text-white/60 font-mono w-6 text-right">{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AML / Compliance flags */}
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Compliance Flags</h3>
          <p className="text-xs text-white/40 mb-4">AML alerts and flagged transactions</p>
          <div className="space-y-3">
            {[
              { label: "AML Alerts", value: complianceKPIs.amlAlerts, severity: "High", color: CHART_COLORS.red },
              { label: "Flagged Transactions", value: complianceKPIs.flaggedTransactions, severity: "Medium", color: CHART_COLORS.amber },
              { label: "Pending KYC Verifications", value: complianceKPIs.pendingKYC, severity: "Low", color: CHART_COLORS.teal },
              { label: "Frozen Accounts", value: complianceKPIs.frozenAccounts, severity: "Medium", color: CHART_COLORS.amber },
            ].map((f) => (
              <div key={f.label} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "oklch(0.22 0.04 155)" }}>
                <div>
                  <div className="text-sm text-white/80 font-medium">{f.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: f.color }}>Severity: {f.severity}</div>
                </div>
                <div className="text-xl font-bold font-mono" style={{color: f.color }}>
                  {formatNumber(f.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DWH Import Status */}
      <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
        <h3 className="text-sm font-semibold text-white mb-1">DWH Import Status</h3>
        <p className="text-xs text-white/40 mb-4">view_ImportStatus — ETL pipeline health</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                {["Package", "Status", "Last Run", "Duration", "24h Runs", "24h Success"].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {importStatus.map((s) => (
                <tr key={s.package} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                  <td className="py-2.5 pr-4 text-white/80 font-medium">{s.package}</td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={s.status} dot />
                  </td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono">{s.lastRun.split(" ")[1]}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono">{s.duration}</td>
                  <td className="py-2.5 pr-4 text-white/50 text-xs font-mono">{s.executions24h}</td>
                  <td className="py-2.5 text-xs font-mono font-semibold" style={{
                   
                    color: s.successes24h === s.executions24h ? CHART_COLORS.green : CHART_COLORS.amber,
                  }}>
                    {s.successes24h}/{s.executions24h}
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
