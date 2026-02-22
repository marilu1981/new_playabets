/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * TopFiltersBar — All filters visible inline, no popover.
 * Layout: vertical "Filters & Controls" label on the left | two-row filter grid on the right.
 *
 * Row 1: Date From | Date To | Daily/Weekly/Monthly | Brand | Territory | Country
 * Row 2: Source | Affiliate | Hist. Segment | Curr. Segment | Cust. Status | Agg. Segment | Outlier | Reset
 */

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardFilters {
  dateFrom: string;
  dateTo: string;
  granularity: "daily" | "weekly" | "monthly";
  brand: string;
  territory: string;
  country: string;
  trafficSource: string;
  affiliateId: string;
  historicalSegment: string;
  currentSegment: string;
  customerStatus: string;
  aggregatedSegment: string;
  outlierFilter: string;
}

export const defaultFilters: DashboardFilters = {
  dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0],
  dateTo: new Date().toISOString().split("T")[0],
  granularity: "daily",
  brand: "all",
  territory: "all",
  country: "all",
  trafficSource: "all",
  affiliateId: "all",
  historicalSegment: "all",
  currentSegment: "all",
  customerStatus: "all",
  aggregatedSegment: "all",
  outlierFilter: "include_all",
};

interface TopFiltersBarProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BAR_BG: React.CSSProperties = {
  background: "oklch(0.155 0.045 155)",
  borderBottom: "1px solid oklch(1 0 0 / 7%)",
};

const INPUT_STYLE: React.CSSProperties = {
  background: "oklch(0.19 0.04 155)",
  color: "oklch(0.85 0.005 65)",
  border: "1px solid oklch(1 0 0 / 12%)",
  colorScheme: "dark",
};

const SELECT_STYLE: React.CSSProperties = {
  background: "oklch(0.19 0.04 155)",
  color: "oklch(0.85 0.005 65)",
  border: "1px solid oklch(1 0 0 / 12%)",
};

const labelCls = "text-xs font-semibold uppercase tracking-widest whitespace-nowrap";
const inputCls = "px-2 py-1 rounded text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-600/30 transition-colors";
const selectCls = "px-2 py-1 rounded text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-600/30 transition-colors";

function granBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? "oklch(0.72 0.14 85)" : "oklch(0.19 0.04 155)",
    color: active ? "oklch(0.12 0.04 155)" : "oklch(0.60 0.005 65)",
    border: "1px solid oklch(1 0 0 / 12%)",
    fontWeight: active ? 700 : 500,
    transition: "all 0.15s",
    cursor: "pointer",
    padding: "4px 10px",
    borderRadius: "4px",
    fontSize: "11px",
    whiteSpace: "nowrap" as const,
  };
}

// Thin vertical divider between filter groups
const Divider = () => (
  <div className="self-stretch w-px flex-shrink-0 my-0.5" style={{ background: "oklch(1 0 0 / 8%)" }} />
);

// A single labelled filter control
function FilterItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span className={cn(labelCls)} style={{ color: "oklch(0.45 0.01 155)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TopFiltersBar({ filters, onChange }: TopFiltersBarProps) {
  const set = (key: keyof DashboardFilters, value: string) =>
    onChange({ ...filters, [key]: value });

  const hasActiveFilters =
    filters.brand !== "all" ||
    filters.territory !== "all" ||
    filters.country !== "all" ||
    filters.trafficSource !== "all" ||
    filters.affiliateId !== "all" ||
    filters.historicalSegment !== "all" ||
    filters.currentSegment !== "all" ||
    filters.customerStatus !== "all" ||
    filters.aggregatedSegment !== "all" ||
    filters.outlierFilter !== "include_all";

  return (
    <div className="flex flex-shrink-0" style={BAR_BG}>

      {/* ── LEFT: Vertical "Filters & Controls" label ─────────────────────── */}
      <div
        className="flex items-center justify-center flex-shrink-0 px-3"
        style={{ borderRight: "1px solid oklch(1 0 0 / 7%)", minWidth: "36px" }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            color: "oklch(0.72 0.14 85)",
          }}
        >
          <SlidersHorizontal size={12} style={{ transform: "rotate(90deg)" }} />
          <span
            className="text-xs font-bold uppercase tracking-widest whitespace-nowrap"
            style={{ color: "oklch(0.55 0.08 85)", letterSpacing: "0.12em" }}
          >
            Filters &amp; Controls
          </span>
        </div>
      </div>

      {/* ── RIGHT: Two rows of filter controls ────────────────────────────── */}
      <div className="flex-1 flex flex-col">

        {/* ROW 1: Date Range | Granularity | Brand | Territory | Country */}
        <div className="flex items-center gap-2 px-4 py-2 flex-wrap">

          {/* Date From */}
          <FilterItem label="From">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => set("dateFrom", e.target.value)}
              className={inputCls}
              style={{ ...INPUT_STYLE, width: "128px" }}
            />
          </FilterItem>

          {/* Date To */}
          <FilterItem label="To">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => set("dateTo", e.target.value)}
              className={inputCls}
              style={{ ...INPUT_STYLE, width: "128px" }}
            />
          </FilterItem>

          <Divider />

          {/* Granularity */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {(["daily", "weekly", "monthly"] as const).map((g) => (
              <button key={g} onClick={() => set("granularity", g)} style={granBtn(filters.granularity === g)}>
                {g === "daily" ? "Daily" : g === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>

          <Divider />

          {/* Brand */}
          <FilterItem label="Brand">
            <select value={filters.brand} onChange={(e) => set("brand", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "128px" }}>
              <option value="all">All Brands</option>
              <option value="playabets_ng">PlayaBets NG</option>
              <option value="playabets_gh">PlayaBets GH</option>
              <option value="playabets_zm">PlayaBets ZM</option>
              <option value="playabets_ug">PlayaBets UG</option>
              <option value="playabets_ke">PlayaBets KE</option>
            </select>
          </FilterItem>

          {/* Territory */}
          <FilterItem label="Territory">
            <select value={filters.territory} onChange={(e) => set("territory", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "120px" }}>
              <option value="all">All</option>
              <option value="west_africa">West Africa</option>
              <option value="east_africa">East Africa</option>
              <option value="southern_africa">Southern Africa</option>
            </select>
          </FilterItem>

          {/* Country */}
          <FilterItem label="Country">
            <select value={filters.country} onChange={(e) => set("country", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "100px" }}>
              <option value="all">All</option>
              <option value="NG">Nigeria</option>
              <option value="GH">Ghana</option>
              <option value="ZM">Zambia</option>
              <option value="UG">Uganda</option>
              <option value="KE">Kenya</option>
            </select>
          </FilterItem>

        </div>

        {/* ROW 2: Source | Affiliate | Segments | Status | Outlier | Reset */}
        <div
          className="flex items-center gap-2 px-4 py-2 flex-wrap"
          style={{ borderTop: "1px solid oklch(1 0 0 / 5%)" }}
        >

          {/* Traffic Source */}
          <FilterItem label="Source">
            <select value={filters.trafficSource} onChange={(e) => set("trafficSource", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "108px" }}>
              <option value="all">All</option>
              <option value="organic">Organic</option>
              <option value="paid">Paid</option>
              <option value="affiliate">Affiliate</option>
              <option value="direct">Direct</option>
              <option value="social">Social</option>
            </select>
          </FilterItem>

          {/* Affiliate */}
          <FilterItem label="Affiliate">
            <select value={filters.affiliateId} onChange={(e) => set("affiliateId", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "116px" }}>
              <option value="all">All</option>
              <option value="aff_001">Affiliate 001</option>
              <option value="aff_002">Affiliate 002</option>
              <option value="aff_003">Affiliate 003</option>
            </select>
          </FilterItem>

          <Divider />

          {/* Historical Segment */}
          <FilterItem label="Hist. Segment">
            <select value={filters.historicalSegment} onChange={(e) => set("historicalSegment", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "100px" }}>
              <option value="all">All</option>
              <option value="VIP">VIP</option>
              <option value="PVIP">PVIP</option>
              <option value="Mass">Mass</option>
              <option value="Mix">Mix</option>
            </select>
          </FilterItem>

          {/* Current Segment */}
          <FilterItem label="Curr. Segment">
            <select value={filters.currentSegment} onChange={(e) => set("currentSegment", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "100px" }}>
              <option value="all">All</option>
              <option value="VIP">VIP</option>
              <option value="PVIP">PVIP</option>
              <option value="Mass">Mass</option>
              <option value="Mix">Mix</option>
            </select>
          </FilterItem>

          {/* Customer Status */}
          <FilterItem label="Status">
            <select value={filters.customerStatus} onChange={(e) => set("customerStatus", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "108px" }}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="dormant">Dormant</option>
              <option value="blocked">Blocked</option>
            </select>
          </FilterItem>

          {/* Aggregated Segment */}
          <FilterItem label="Agg. Segment">
            <select value={filters.aggregatedSegment} onChange={(e) => set("aggregatedSegment", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "116px" }}>
              <option value="all">All</option>
              <option value="high_value">High Value</option>
              <option value="medium_value">Medium Value</option>
              <option value="low_value">Low Value</option>
            </select>
          </FilterItem>

          {/* Outlier Filter */}
          <FilterItem label="Outliers">
            <select value={filters.outlierFilter} onChange={(e) => set("outlierFilter", e.target.value)} className={selectCls} style={{ ...SELECT_STYLE, width: "130px" }}>
              <option value="include_all">Include All</option>
              <option value="exclude_outliers">Exclude Outliers</option>
              <option value="only_outliers">Only Outliers</option>
            </select>
          </FilterItem>

          <Divider />

          {/* Reset — only when filters are active */}
          {hasActiveFilters && (
            <button
              onClick={() => onChange(defaultFilters)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors flex-shrink-0"
              style={{
                background: "oklch(0.55 0.22 25 / 15%)",
                color: "oklch(0.70 0.18 25)",
                border: "1px solid oklch(0.55 0.22 25 / 25%)",
              }}
            >
              <RotateCcw size={11} />
              Reset
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
