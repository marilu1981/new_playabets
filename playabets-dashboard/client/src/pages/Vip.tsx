import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import TopFiltersBar, { DashboardFilters, defaultFilters } from "@/components/TopFiltersBar";
import KpiCard from "@/components/KpiCard";
import DataTable from "@/components/DataTable";
import { Crown, Users, Wallet, Gift } from "lucide-react";
import { cachedFetch } from "@/lib/apiCache";
import { formatFull, formatNumber } from "@/lib/formatters";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

type VipSummary = {
  has_data: boolean;
  total: number;
  stints: number;
  active_now: number;
  active_as_of_end: number;
  onboarded_in_period: number;
  offboarded_in_period: number;
  with_onboard_date: number;
  date_errors: number;
  by_stage: Array<{ stage: string; count: number }>;
  by_account_manager: Array<{ account_manager: string; count: number }>;
  account_managers: string[];
  stages: string[];
};

type VipRow = {
  user_id: string | null;
  name?: string | null;
  surname?: string | null;
  account_manager: string;
  vip_lifecycle_stage: string;
  country?: string | null;
  userstatus?: string | null;
  balance?: number | null;
  onboard_date?: string | null;
  offboard_date?: string | null;
  is_current?: boolean;
  is_date_error?: boolean;
};

export default function VipPage() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters);
  const [manager, setManager] = useState<string>("all");
  const [stage, setStage] = useState<string>("all");
  const [currentOnly, setCurrentOnly] = useState<boolean>(false);
  const [summary, setSummary] = useState<VipSummary | null>(null);
  const [rows, setRows] = useState<VipRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      start: filters.dateFrom,
      end: filters.dateTo,
    });
    if (manager !== "all") params.set("account_manager", manager);
    if (stage !== "all") params.set("stage", stage);
    if (currentOnly) params.set("current_only", "true");
    return params.toString();
  }, [filters.dateFrom, filters.dateTo, manager, stage, currentOnly]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [summaryRes, listRes] = await Promise.allSettled([
        fetchJson<VipSummary>(`/vip/summary?${query}`),
        fetchJson<{ rows: VipRow[] }>(`/vip/list?${query}&limit=500`),
      ]);

      if (cancelled) return;

      if (summaryRes.status === "fulfilled") {
        setSummary(summaryRes.value);
      } else {
        setSummary(null);
      }

      if (listRes.status === "fulfilled") {
        setRows(listRes.value.rows ?? []);
      } else {
        setRows([]);
      }

      setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) {
        setSummary(null);
        setRows([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const managerOptions = summary?.account_managers ?? [];
  const stageOptions = summary?.stages ?? [];

  return (
    <DashboardLayout
      title="VIP Portfolio"
      subtitle="Lifecycle roster, account-manager ownership, and VIP activity"
      filtersBar={<TopFiltersBar filters={filters} onChange={setFilters} />}
    >
      <div className="rounded-xl p-5 mb-6" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Account Manager</label>
            <select
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm"
            >
              <option value="all">All managers</option>
              {managerOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Lifecycle Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="px-3 py-2 rounded-md border border-gray-300 bg-white text-sm"
            >
              <option value="all">All stages</option>
              {stageOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-700 ml-1 mb-1">
            <input type="checkbox" checked={currentOnly} onChange={(e) => setCurrentOnly(e.target.checked)} />
            Only currently active (as of Date To)
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard title="VIP Users" value={summary ? formatFull(summary.total) : "—"} subtitle="Distinct users in period" icon={<Users size={18} />} accent="teal" loading={loading} />
          <KpiCard title="Active VIP" value={summary ? formatFull(summary.active_as_of_end) : "—"} subtitle="Active as of end date" icon={<Crown size={18} />} accent="gold" loading={loading} />
          <KpiCard title="Onboarded" value={summary ? formatFull(summary.onboarded_in_period) : "—"} subtitle="Users onboarded in period" icon={<Users size={18} />} accent="green" loading={loading} />
          <KpiCard title="Offboarded" value={summary ? formatFull(summary.offboarded_in_period) : "—"} subtitle="Users offboarded in period" icon={<Users size={18} />} accent="amber" loading={loading} />
          <KpiCard title="VIP Stints" value={summary ? formatFull(summary.stints) : "—"} subtitle="Lifecycle stint rows" icon={<Wallet size={18} />} accent="teal" loading={loading} />
          <KpiCard title="Date Errors" value={summary ? formatFull(summary.date_errors) : "—"} subtitle="Offboard before onboard" icon={<Gift size={18} />} accent="red" loading={loading} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">By lifecycle stage</h3>
          <div className="space-y-3">
            {(summary?.by_stage ?? []).map((row) => {
              const pct = summary && summary.total > 0 ? (row.count / summary.total) * 100 : 0;
              return (
                <div key={row.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">{row.stage}</span>
                    <span className="font-medium text-gray-800">{formatNumber(row.count)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "oklch(0.65 0.15 195)" }} />
                  </div>
                </div>
              );
            })}
            {(!summary || summary.by_stage.length === 0) && (
              <div className="text-xs text-gray-400">No stage data for selected filters.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl p-5 xl:col-span-2" style={{ background: "#ffffff", border: "1px solid #dde8dd", boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">VIP roster</h3>
          <DataTable<VipRow>
            compact
            className="border-gray-200"
            emptyMessage={loading ? "Loading VIP roster..." : "No VIP rows found for selected filters."}
            columns={[
              { key: "user_id", header: "User ID", mono: true },
              {
                key: "full_name",
                header: "Name",
                render: (row) => {
                  const full = `${row.name ?? ""} ${row.surname ?? ""}`.trim();
                  return full || "—";
                },
              },
              { key: "account_manager", header: "Account Manager" },
              { key: "vip_lifecycle_stage", header: "Stage" },
              { key: "country", header: "Country" },
              { key: "onboard_date", header: "Onboard", render: (row) => row.onboard_date ?? "—" },
              { key: "offboard_date", header: "Offboard", render: (row) => row.offboard_date ?? "—" },
              { key: "userstatus", header: "Status", render: (row) => row.userstatus ?? "—" },
              {
                key: "balance",
                header: "Balance",
                align: "right",
                render: (row) => row.balance == null ? "—" : formatFull(row.balance),
              },
            ]}
            data={rows}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
