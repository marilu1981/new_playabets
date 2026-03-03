import { useEffect, useMemo, useState } from "react";
/**
 * PLAYA BETS — Bonus & Campaigns Page
 * DWH Views: view_BonusCampaigns, view_BonusBalances, view_Freebets
 * Data source: Supabase bonus_daily table via /api/bonus/kpis
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import { Gift, Users, Percent, Ticket } from "lucide-react";
import { bonusCampaigns as baseBonusCampaigns, bonusKPIs as baseBonusKPIs } from "@/lib/mockData";
import { formatCompact, formatNumber, formatPercent } from "@/lib/formatters";
import {
  filterByDateRange,
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080").replace(/\/+$/, "");
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

export default function BonusPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [liveBonusKPIs, setLiveBonusKPIs] = useState<typeof baseBonusKPIs | null>(null);

  useEffect(() => {
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
    fetchJson<{ bonus_credited?: number; bonus_used?: number; bonus_expired?: number; active_campaigns?: number; active_users?: number }>(
      `/bonus/kpis?${query}`
    )
      .then((d) => {
        const credited = Number(d.bonus_credited ?? 0);
        const used     = Number(d.bonus_used     ?? 0);
        const expired  = Number(d.bonus_expired  ?? 0);
        const users    = Number(d.active_users   ?? 1);
        if (credited === 0 && used === 0) {
          setLiveBonusKPIs(null);
          return;
        }
        setLiveBonusKPIs({
          ...baseBonusKPIs,
          totalBonusBalance: credited,
          freebetsIssued:    credited,
          freebetsUsed:      used,
          freebetsExpired:   expired,
          activeCampaigns:   Number(d.active_campaigns ?? baseBonusKPIs.activeCampaigns),
          avgBonusPerUser:   users > 0 ? Number((credited / users).toFixed(2)) : 0,
        });
      })
      .catch(() => setLiveBonusKPIs(null));
  }, [filters.dateFrom, filters.dateTo]);

  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const bonusCampaigns = useMemo(
    () =>
      scaleArrayNumericFields(
        filterByDateRange(baseBonusCampaigns, filters, (row) => row.startDate),
        multiplier,
        ["campaignId", "name", "status", "bonusType", "startDate", "endDate", "roi"],
      ),
    [filters, multiplier],
  );
  const bonusKPIs = useMemo(() => {
    if (liveBonusKPIs) return liveBonusKPIs;
    return scaleObjectNumericFields(baseBonusKPIs, multiplier);
  }, [multiplier, liveBonusKPIs]);

  const issuedSafe = Math.max(1, bonusKPIs.freebetsIssued);
  const freebetUsageRate = (bonusKPIs.freebetsUsed / issuedSafe * 100).toFixed(1);

  return (
    <DashboardLayout title="Bonus & Campaigns" subtitle="Campaign performance, freebet usage, and bonus balances"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Active Campaigns" value={bonusKPIs.activeCampaigns} subtitle="Running now" icon={<Gift size={18} />} accent="gold" />
        <KpiCard title="Total Bonus Balance" value={`${formatCompact(bonusKPIs.totalBonusBalance)}`} subtitle="Across all users" change={-4.2} changeLabel="vs last month" icon={<Percent size={18} />} accent="amber" />
        <KpiCard title="Freebets Issued" value={formatCompact(bonusKPIs.freebetsIssued)} subtitle={`${freebetUsageRate}% usage rate`} icon={<Ticket size={18} />} accent="teal" />
        <KpiCard title="Avg Bonus / User" value={`${bonusKPIs.avgBonusPerUser.toFixed(1)}`} subtitle="Per active user" change={2.1} changeLabel="vs last month" icon={<Users size={18} />} accent="green" />
      </div>

      {/* Freebet funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Freebet Funnel</h3>
          <p className="text-xs text-white/40 mb-4">Issued → Used → Expired</p>
          <div className="space-y-4">
            {[
              { label: "Issued", value: bonusKPIs.freebetsIssued, color: CHART_COLORS.gold, pct: 100 },
              { label: "Used", value: bonusKPIs.freebetsUsed, color: CHART_COLORS.green, pct: bonusKPIs.freebetsUsed / issuedSafe * 100 },
              { label: "Expired", value: bonusKPIs.freebetsExpired, color: CHART_COLORS.red, pct: bonusKPIs.freebetsExpired / issuedSafe * 100 },
              { label: "Pending", value: bonusKPIs.freebetsIssued - bonusKPIs.freebetsUsed - bonusKPIs.freebetsExpired, color: CHART_COLORS.amber, pct: (bonusKPIs.freebetsIssued - bonusKPIs.freebetsUsed - bonusKPIs.freebetsExpired) / issuedSafe * 100 },
            ].map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-white/60">{f.label}</span>
                  <span className="font-mono" style={{color: f.color }}>
                    {formatCompact(f.value)} ({f.pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${f.pct}%`, background: f.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Campaign stats */}
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background: "oklch(0.19 0.04 155)", border: "1px solid oklch(1 0 0 / 6%)" }}>
          <h3 className="text-sm font-semibold text-white mb-1">Campaign Performance</h3>
          <p className="text-xs text-white/40 mb-4">view_BonusCampaigns — recent campaigns</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)" }}>
                  {["ID", "Campaign", "Type", "Status", "Users", "Paid", "ROI"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-white/30 pb-2 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bonusCampaigns.map((c) => (
                  <tr key={c.campaignId} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid oklch(1 0 0 / 4%)" }}>
                    <td className="py-2.5 pr-4 text-white/40 text-xs font-mono">#{c.campaignId}</td>
                    <td className="py-2.5 pr-4 text-white/80 font-medium text-sm max-w-[180px] truncate">{c.name}</td>
                    <td className="py-2.5 pr-4 text-white/50 text-xs">{c.bonusType}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={c.status} dot /></td>
                    <td className="py-2.5 pr-4 text-white/50 text-xs font-mono">{formatCompact(c.usersEnrolled)}</td>
                    <td className="py-2.5 pr-4 text-xs font-mono" style={{color: CHART_COLORS.gold }}>{ formatCompact(c.totalPaid)}</td>
                    <td className="py-2.5">
                      <span className="text-xs font-mono font-semibold" style={{
                        color: c.roi >= 0 ? CHART_COLORS.green : CHART_COLORS.red,
                      }}>
                        {c.roi >= 0 ? "+" : ""}{c.roi.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </DashboardLayout>
  );
}
