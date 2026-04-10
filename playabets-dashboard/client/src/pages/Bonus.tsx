import { useEffect, useMemo, useState } from "react";
/**
 * PLAYA BETS — Bonus & Campaigns Page
 * DWH Views: view_BonusCampaigns, view_BonusBalances, view_Freebets
 * Data source: Supabase bonus_daily table via /api/bonus/kpis
 */

import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import MockOverlay from "@/components/MockOverlay";
import StatusBadge from "@/components/StatusBadge";
import { Gift, Users, Percent, Ticket } from "lucide-react";
import { bonusCampaigns as baseBonusCampaigns, bonusKPIs as baseBonusKPIs } from "@/lib/mockData";
import { formatCompact, formatFull, formatNumber } from "@/lib/formatters";
import {
  filterByDateRange,
  getFilterMultiplier,
  scaleArrayNumericFields,
  scaleObjectNumericFields,
} from "@/lib/filterUtils";

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
  const [liveFreebets, setLiveFreebets] = useState<{ issued: number; used: number; expired: number; pending: number; total_amount: number } | null>(null);

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

    fetchJson<{ issued?: number; used?: number; expired?: number; pending?: number; total_amount?: number; has_data?: boolean }>(
      `/bonus/freebets?${query}`
    )
      .then((d) => {
        if (d.has_data === false || (d.issued ?? 0) === 0) {
          setLiveFreebets(null);
          return;
        }
        setLiveFreebets({
          issued: Number(d.issued ?? 0),
          used: Number(d.used ?? 0),
          expired: Number(d.expired ?? 0),
          pending: Number(d.pending ?? 0),
          total_amount: Number(d.total_amount ?? 0),
        });
      })
      .catch(() => setLiveFreebets(null));
  }, [filters.dateFrom, filters.dateTo]);

  const multiplier = useMemo(() => getFilterMultiplier(filters), [filters]);
  const bonusCampaigns = useMemo<BonusCampaignRow[]>(
    () => {
      if (liveCampaigns) {
        return filterByDateRange(liveCampaigns, filters, (row) => row.startDate);
      }
      return scaleArrayNumericFields(
        filterByDateRange(baseBonusCampaigns, filters, (row) => row.startDate),
        multiplier,
        ["campaignId", "name", "status", "bonusType", "startDate", "endDate", "roi"],
      ) as BonusCampaignRow[];
    },
    [filters, liveCampaigns, multiplier],
  );
  const bonusKPIs = useMemo(() => {
    return scaleObjectNumericFields(baseBonusKPIs, multiplier);
  }, [multiplier]);

  const bonusCards = useMemo<BonusCards>(() => {
    if (liveBonusCards) return liveBonusCards;
    return {
      totalBonusesCredited: Number(bonusKPIs.totalBonusBalance ?? 0),
      estTotalBonusesPerUser: Number(bonusKPIs.freebetsIssued ?? 0),
      averageDailyBonusPerUser: Number(bonusKPIs.avgBonusPerUser ?? 0),
      averageDailyUniqueBonusUsers: Number(bonusKPIs.activeCampaigns ?? 0),
      bonusesPaidTotalCount: Number((bonusKPIs.freebetsUsed ?? 0) + (bonusKPIs.freebetsExpired ?? 0)),
    };
  }, [bonusKPIs, liveBonusCards]);

  const freebetStats = useMemo(() => {
    if (liveFreebets) return liveFreebets;
    return {
      issued: bonusKPIs.freebetsIssued,
      used: bonusKPIs.freebetsUsed,
      expired: bonusKPIs.freebetsExpired,
      pending: bonusKPIs.freebetsIssued - bonusKPIs.freebetsUsed - bonusKPIs.freebetsExpired,
      total_amount: 0,
    };
  }, [liveFreebets, bonusKPIs]);
  const issuedSafe = Math.max(1, freebetStats.issued);
  const pageMode = liveBonusCards || liveCampaigns || liveFreebets ? "partial" : "mock";

  return (
    <DashboardLayout title="Bonus & Campaigns" subtitle="Campaign performance, freebet usage, and bonus balances"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}>
      <div className="text-xs text-gray-400 mb-3">
        Data mode: {pageMode === "partial" ? "Partial Live" : "Mock"}
      </div>
      {/* KPI Row */}
      <div className="rounded-xl p-5 mb-6" style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <KpiCard title="Average Daily Unique Bonus Users" value={formatFull(Math.round(bonusCards.averageDailyUniqueBonusUsers))} subtitle="Mean daily unique users bonused" icon={<Gift size={18} />} accent="gold" />
          <KpiCard title="Total Bonuses Credited" value={formatFull(bonusCards.totalBonusesCredited)} subtitle="Total credited in selected range" icon={<Percent size={18} />} accent="amber" />
          <KpiCard title="Est. Total Bonuses per User" value={formatFull(bonusCards.estTotalBonusesPerUser)} subtitle="Sum of daily bonus-per-user values" icon={<Ticket size={18} />} accent="teal" />
          <KpiCard title="Average Daily Bonus per User" value={`${bonusCards.averageDailyBonusPerUser.toFixed(1)}`} subtitle="Mean of daily credited/user" icon={<Users size={18} />} accent="green" />
          <KpiCard title="Bonuses Paid - Total Count" value={formatFull(bonusCards.bonusesPaidTotalCount)} subtitle="Total bonus count in selected range" icon={<Gift size={18} />} accent="gold" />
        </div>
      </div>

      {/* Freebet funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="relative rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <MockOverlay active={!liveFreebets} badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Freebet Funnel</h3>
          <p className="text-xs text-gray-400 mb-4">Issued → Used → Expired</p>
          <div className="space-y-4">
            {[
              { label: "Issued", value: freebetStats.issued, color: CHART_COLORS.gold, pct: 100 },
              { label: "Used", value: freebetStats.used, color: CHART_COLORS.green, pct: freebetStats.used / issuedSafe * 100 },
              { label: "Expired", value: freebetStats.expired, color: CHART_COLORS.red, pct: freebetStats.expired / issuedSafe * 100 },
              { label: "Pending", value: freebetStats.pending, color: CHART_COLORS.amber, pct: freebetStats.pending / issuedSafe * 100 },
            ].map((f) => (
              <div key={f.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-500">{f.label}</span>
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
        <div className="relative lg:col-span-2 rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <MockOverlay active={!liveCampaigns} badge label="Mock Data" />
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Campaign Performance</h3>
          <p className="text-xs text-gray-400 mb-4">view_BonusCampaigns — recent campaigns</p>
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
        </div>
      </div>

    </DashboardLayout>
  );
}
