import { useEffect, useState } from "react";
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
import { formatCompact, formatFull } from "@/lib/formatters";
import { filterByDateRange } from "@/lib/filterUtils";

import { cachedFetch } from "@/lib/apiCache";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

const CHART_COLORS = {
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
  red: "oklch(0.55 0.22 25)",
};

type BonusCards = {
  totalBonusesCredited: number;
  estTotalBonusesPerUser: number;
  averageDailyBonusPerUser: number;
  averageDailyUniqueBonusUsers: number;
  bonusesPaidTotalCount: number;
};

type BonusCampaignRow = {
  campaignId: number;
  name: string;
  status: string;
  bonusType: string;
  startDate: string;
  endDate: string;
  usersEnrolled: number | null;
  totalPaid: number | null;
  roi: number | null;
};

export default function BonusPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [liveBonusCards, setLiveBonusCards] = useState<BonusCards | null>(null);
  const [liveCampaigns, setLiveCampaigns] = useState<BonusCampaignRow[] | null>(null);

  useEffect(() => {
    const query = `start=${filters.dateFrom}&end=${filters.dateTo}`;
    fetchJson<{
      total_bonuses_credited?: number;
      average_daily_bonus_per_user?: number;
      est_total_bonuses_per_user?: number;
      average_daily_unique_bonus_users?: number;
      bonuses_paid_total_count?: number;
      first_deposit_bonus_amount_total?: number;
    }>(
      `/bonus/kpis?${query}`
    )
      .then((d) => {
        const credited = Number(d.total_bonuses_credited ?? 0);
        const totalCount = Number(d.bonuses_paid_total_count ?? 0);
        if (credited === 0 && totalCount === 0) {
          setLiveBonusCards(null);
          return;
        }
        setLiveBonusCards({
          totalBonusesCredited: credited,
          estTotalBonusesPerUser: Number(d.est_total_bonuses_per_user ?? 0),
          averageDailyBonusPerUser: Number(d.average_daily_bonus_per_user ?? 0),
          averageDailyUniqueBonusUsers: Number(d.average_daily_unique_bonus_users ?? 0),
          bonusesPaidTotalCount: totalCount,
        });
      })
      .catch(() => setLiveBonusCards(null));

    fetchJson<{ campaigns?: Array<Partial<BonusCampaignRow>> }>(`/bonus/campaigns`)
      .then((d) => {
        const campaigns = (d.campaigns ?? [])
          .map((row) => ({
            campaignId: Number(row.campaignId ?? 0),
            name: String(row.name ?? "Unknown Campaign"),
            status: String(row.status ?? "Unknown"),
            bonusType: String(row.bonusType ?? "Unknown"),
            startDate: String(row.startDate ?? ""),
            endDate: String(row.endDate ?? ""),
            usersEnrolled: row.usersEnrolled == null ? null : Number(row.usersEnrolled),
            totalPaid: row.totalPaid == null ? null : Number(row.totalPaid),
            roi: row.roi == null ? null : Number(row.roi),
          }))
          .filter((row) => row.campaignId > 0 || row.name !== "Unknown Campaign");
        setLiveCampaigns(campaigns.length > 0 ? campaigns : null);
      })
      .catch(() => setLiveCampaigns(null));
  }, [filters.dateFrom, filters.dateTo]);

  const bonusCampaigns = liveCampaigns
    ? filterByDateRange(liveCampaigns, filters, (row) => row.startDate)
    : [];

  return (
    <DashboardLayout title="Bonus & Campaigns" subtitle="Campaign performance, freebet usage, and bonus balances"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      {/* KPI Row */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <KpiCard title="Average Daily Unique Bonus Users" value={liveBonusCards ? formatFull(Math.round(liveBonusCards.averageDailyUniqueBonusUsers)) : "Pending"} subtitle="Mean daily unique users bonused" icon={<Gift size={18} />} accent="gold" />
          <KpiCard title="Total Bonuses Credited" value={liveBonusCards ? formatFull(liveBonusCards.totalBonusesCredited) : "Pending"} subtitle="Total credited in selected range" icon={<Percent size={18} />} accent="amber" />
          <KpiCard title="Est. Total Bonuses per User" value={liveBonusCards ? formatFull(liveBonusCards.estTotalBonusesPerUser) : "Pending"} subtitle="Sum of daily bonus-per-user values" icon={<Ticket size={18} />} accent="teal" />
          <KpiCard title="Average Daily Bonus per User" value={liveBonusCards ? liveBonusCards.averageDailyBonusPerUser.toFixed(1) : "Pending"} subtitle="Mean of daily credited/user" icon={<Users size={18} />} accent="green" />
          <KpiCard title="Bonuses Paid - Total Count" value={liveBonusCards ? formatFull(liveBonusCards.bonusesPaidTotalCount) : "Pending"} subtitle="Total bonus count in selected range" icon={<Gift size={18} />} accent="gold" />
        </div>
      </div>

      {/* Campaign Performance */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Campaign Performance</h3>
        <p className="text-xs text-gray-400 mb-4">view_BonusCampaigns — recent campaigns</p>
        {bonusCampaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid #e4ece4" }}>
                  {["ID", "Campaign", "Type", "Status", "Users", "Paid", "ROI"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wider text-gray-400 pb-2 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bonusCampaigns.map((c) => (
                  <tr key={c.campaignId} className="hover:bg-white/3 transition-colors" style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td className="py-2.5 pr-4 text-gray-400 text-xs font-mono">#{c.campaignId}</td>
                    <td className="py-2.5 pr-4 text-gray-800 font-medium text-sm max-w-[180px] truncate">{c.name}</td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs">{c.bonusType}</td>
                    <td className="py-2.5 pr-4"><StatusBadge status={c.status} dot /></td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs font-mono">{c.usersEnrolled == null ? "—" : formatCompact(c.usersEnrolled)}</td>
                    <td className="py-2.5 pr-4 text-xs font-mono" style={{color: CHART_COLORS.gold }}>{c.totalPaid == null ? "—" : formatCompact(c.totalPaid)}</td>
                    <td className="py-2.5">
                      {c.roi == null ? (
                        <span className="text-xs font-mono text-gray-300">—</span>
                      ) : (
                        <span className="text-xs font-mono font-semibold" style={{
                          color: c.roi >= 0 ? CHART_COLORS.green : CHART_COLORS.red,
                        }}>
                          {c.roi >= 0 ? "+" : ""}{c.roi.toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-xs text-gray-400">
            No campaign data available for this period
          </div>
        )}
      </div>

    </DashboardLayout>
  );
}
