/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * FiltersPanel — Collapsible left-side filter & controls panel
 * Matches the client's Claude demo spec exactly.
 * Savanna Gold design system — dark green sidebar, gold accents.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
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
  currentSegment: string;
  customerStatus: string;
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
  currentSegment: "all",
  customerStatus: "all",
};

interface FiltersPanelProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
}

const selectClass =
  "w-full px-2 py-1.5 rounded text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 transition-colors";

const inputClass =
  "w-full px-2 py-1.5 rounded text-xs font-medium focus:outline-none focus:ring-1 transition-colors";

const labelClass = "block text-xs font-semibold uppercase tracking-widest mb-1";

export default function FiltersPanel({ filters, onChange }: FiltersPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const set = (key: keyof DashboardFilters, value: string) =>
    onChange({ ...filters, [key]: value });

  const panelStyle: React.CSSProperties = {
    background: "oklch(0.14 0.05 155)",
    borderRight: "1px solid oklch(1 0 0 / 6%)",
    minWidth: collapsed ? "2.5rem" : "200px",
    width: collapsed ? "2.5rem" : "200px",
    transition: "width 0.25s ease, min-width 0.25s ease",
  };

  const selectStyle: React.CSSProperties = {
    background: "oklch(0.18 0.04 155)",
    color: "oklch(0.85 0.005 65)",
    border: "1px solid oklch(1 0 0 / 10%)",
  };

  const inputStyle: React.CSSProperties = {
    background: "oklch(0.18 0.04 155)",
    color: "oklch(0.85 0.005 65)",
    border: "1px solid oklch(1 0 0 / 10%)",
    colorScheme: "dark",
  };

  const granBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "oklch(0.72 0.14 85)" : "oklch(0.18 0.04 155)",
    color: active ? "oklch(0.12 0.04 155)" : "oklch(0.65 0.005 65)",
    border: "1px solid oklch(1 0 0 / 10%)",
    fontWeight: active ? 700 : 500,
    transition: "all 0.15s",
  });

  return (
    <aside
      className="relative flex flex-col h-full overflow-hidden flex-shrink-0"
      style={panelStyle}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-3 border-b flex-shrink-0"
        style={{ borderColor: "oklch(1 0 0 / 6%)" }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              size={13}
              style={{ color: "oklch(0.72 0.14 85)" }}
            />
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "oklch(0.72 0.14 85)" }}
            >
              Filters
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-6 h-6 rounded text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Collapsed icon strip */}
      {collapsed && (
        <div className="flex flex-col items-center pt-3 gap-2">
          <SlidersHorizontal
            size={14}
            style={{ color: "oklch(0.72 0.14 85 / 60%)" }}
          />
        </div>
      )}

      {/* Filter controls */}
      {!collapsed && (
        <div
          className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
          style={{ scrollbarWidth: "thin" }}
        >
          {/* DATE RANGE */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              Date Range
            </span>
            <div className="space-y-1">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => set("dateFrom", e.target.value)}
                className={cn(inputClass, "focus:ring-amber-600/40")}
                style={inputStyle}
              />
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => set("dateTo", e.target.value)}
                className={cn(inputClass, "focus:ring-amber-600/40")}
                style={inputStyle}
              />
            </div>
          </div>

          {/* VIEW GRANULARITY */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              View Granularity
            </span>
            <div className="flex gap-1">
              {(["daily", "weekly", "monthly"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => set("granularity", g)}
                  className="flex-1 py-1 rounded text-xs font-semibold capitalize"
                  style={granBtnStyle(filters.granularity === g)}
                >
                  {g.charAt(0).toUpperCase() + g.slice(1, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* BRAND */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              Brand (TBC)
            </span>
            <select
              value={filters.brand}
              onChange={(e) => set("brand", e.target.value)}
              className={cn(selectClass, "focus:ring-amber-600/40")}
              style={selectStyle}
            >
              <option value="all">All Brands</option>
              <option value="playabets_ng">PlayaBets NG</option>
              <option value="playabets_gh">PlayaBets GH</option>
              <option value="playabets_zm">PlayaBets ZM</option>
              <option value="playabets_ug">PlayaBets UG</option>
              <option value="playabets_ke">PlayaBets KE</option>
            </select>
          </div>

          {/* TERRITORY */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              Territory
            </span>
            <select
              value={filters.territory}
              onChange={(e) => set("territory", e.target.value)}
              className={cn(selectClass, "focus:ring-amber-600/40")}
              style={selectStyle}
            >
              <option value="all">All Territories</option>
              <option value="west_africa">West Africa</option>
              <option value="east_africa">East Africa</option>
              <option value="southern_africa">Southern Africa</option>
            </select>
          </div>

          {/* CUSTOMER COUNTRY */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              Customer Country
            </span>
            <select
              value={filters.country}
              onChange={(e) => set("country", e.target.value)}
              className={cn(selectClass, "focus:ring-amber-600/40")}
              style={selectStyle}
            >
              <option value="all">All Countries</option>
              <option value="NG">Nigeria</option>
              <option value="GH">Ghana</option>
              <option value="ZM">Zambia</option>
              <option value="UG">Uganda</option>
              <option value="KE">Kenya</option>
              <option value="ZA">South Africa</option>
            </select>
          </div>

          {/* TRAFFIC SOURCE */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              Traffic Source (TBC)
            </span>
            <select
              value={filters.trafficSource}
              onChange={(e) => set("trafficSource", e.target.value)}
              className={cn(selectClass, "focus:ring-amber-600/40")}
              style={selectStyle}
            >
              <option value="all">All Sources</option>
              <option value="organic">Organic</option>
              <option value="paid">Paid</option>
              <option value="affiliate">Affiliate</option>
              <option value="direct">Direct</option>
              <option value="social">Social</option>
            </select>
          </div>

          {/* AFFILIATE ID */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              Affiliate (TBC)
            </span>
            <select
              value={filters.affiliateId}
              onChange={(e) => set("affiliateId", e.target.value)}
              className={cn(selectClass, "focus:ring-amber-600/40")}
              style={selectStyle}
            >
              <option value="all">All Affiliates</option>
              <option value="aff_001">Affiliate 001</option>
              <option value="aff_002">Affiliate 002</option>
              <option value="aff_003">Affiliate 003</option>
            </select>
          </div>

          {/* USER SEGMENT */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              User Segment (TBC)
            </span>
            <select
              value={filters.currentSegment}
              onChange={(e) => set("currentSegment", e.target.value)}
              className={cn(selectClass, "focus:ring-amber-600/40")}
              style={selectStyle}
            >
              <option value="all">All Segments</option>
              <option value="VIP">VIP</option>
              <option value="PVIP">PVIP</option>
              <option value="Mass">Mass</option>
              <option value="Mix">Mix</option>
            </select>
          </div>

          {/* CUSTOMER STATUS */}
          <div>
            <span className={labelClass} style={{ color: "oklch(0.55 0.01 155)" }}>
              Customer Status
            </span>
            <select
              value={filters.customerStatus}
              onChange={(e) => set("customerStatus", e.target.value)}
              className={cn(selectClass, "focus:ring-amber-600/40")}
              style={selectStyle}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="dormant">Dormant</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

        </div>
      )}
    </aside>
  );
}
