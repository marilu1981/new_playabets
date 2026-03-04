/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * TopFiltersBar — Label-above-control stacked layout.
 * All controls share a standard width (140px dropdowns, 130px date inputs).
 * Labels sit in small caps above each control — no inline labels, no abbreviations.
 *
 * Row 1: Date From | Date To | Granularity | Brand | Territory | Country
 * Row 2: Traffic Source | Affiliate | User Segment | Customer Status | [Reset]
 */

import { RotateCcw, SlidersHorizontal } from "lucide-react";

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

interface TopFiltersBarProps {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  resetFilters?: DashboardFilters;
}

// ── Shared style constants ────────────────────────────────────────────────────
const BAR_BG: React.CSSProperties = {
  background: "oklch(0.155 0.045 155)",
  borderBottom: "1px solid oklch(1 0 0 / 7%)",
};

// Standard control width — all dropdowns and date inputs use this
const CTRL_W = 140;

const INPUT_STYLE: React.CSSProperties = {
  background: "oklch(0.19 0.04 155)",
  color: "oklch(0.85 0.005 65)",
  border: "1px solid oklch(1 0 0 / 14%)",
  colorScheme: "dark",
  width: `${CTRL_W}px`,
};

const SELECT_STYLE: React.CSSProperties = {
  background: "oklch(0.19 0.04 155)",
  color: "oklch(0.85 0.005 65)",
  border: "1px solid oklch(1 0 0 / 14%)",
  width: `${CTRL_W}px`,
};

const LABEL_STYLE: React.CSSProperties = {
  color: "oklch(0.50 0.06 155)",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  lineHeight: 1,
  marginBottom: "4px",
  whiteSpace: "nowrap",
};

const inputCls =
  "px-2 py-1.5 rounded text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-600/30 transition-colors";
const selectCls =
  "px-2 py-1.5 rounded text-xs font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-600/30 transition-colors";

// Thin vertical divider between logical groups
const Divider = () => (
  <div
    className="flex-shrink-0 self-stretch"
    style={{
      width: "1px",
      background: "oklch(1 0 0 / 8%)",
      margin: "0 4px",
    }}
  />
);

// A single stacked control: label on top, input/select below
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-shrink-0">
      <span style={LABEL_STYLE}>{label}</span>
      {children}
    </div>
  );
}

// Granularity toggle — three buttons, same height as other controls
function GranularityToggle({
  value,
  onChange,
}: {
  value: DashboardFilters["granularity"];
  onChange: (v: DashboardFilters["granularity"]) => void;
}) {
  const btn = (v: DashboardFilters["granularity"], label: string) => (
    <button
      key={v}
      onClick={() => onChange(v)}
      style={{
        background: value === v ? "oklch(0.72 0.14 85)" : "oklch(0.19 0.04 155)",
        color: value === v ? "oklch(0.12 0.04 155)" : "oklch(0.60 0.005 65)",
        border: "1px solid oklch(1 0 0 / 14%)",
        fontWeight: value === v ? 700 : 500,
        transition: "all 0.15s",
        cursor: "pointer",
        padding: "5px 12px",
        fontSize: "11px",
        whiteSpace: "nowrap" as const,
      }}
    >
      {label}
    </button>
  );

  return (
    <Field label="Granularity">
      <div className="flex" style={{ borderRadius: "6px", overflow: "hidden" }}>
        {btn("daily", "Daily")}
        {btn("weekly", "Weekly")}
        {btn("monthly", "Monthly")}
      </div>
    </Field>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TopFiltersBar({ filters, onChange, resetFilters }: TopFiltersBarProps) {
  const set = (key: keyof DashboardFilters, value: string) =>
    onChange({ ...filters, [key]: value });
  const resetTo = resetFilters ?? defaultFilters;

  const hasActiveFilters =
    filters.brand !== "all" ||
    filters.territory !== "all" ||
    filters.country !== "all" ||
    filters.trafficSource !== "all" ||
    filters.affiliateId !== "all" ||
    filters.currentSegment !== "all" ||
    filters.customerStatus !== "all";

  return (
    <div className="flex flex-shrink-0" style={BAR_BG}>

      {/* ── Vertical "Filters & Controls" label ───────────────────────────── */}
      <div
        className="flex items-center justify-center flex-shrink-0 px-3"
        style={{ borderRight: "1px solid oklch(1 0 0 / 7%)", minWidth: "36px" }}
      >
        <div
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <SlidersHorizontal
            size={12}
            style={{ color: "oklch(0.72 0.14 85)", transform: "rotate(90deg)" }}
          />
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "oklch(0.55 0.08 85)",
              whiteSpace: "nowrap",
            }}
          >
            Filters &amp; Controls
          </span>
        </div>
      </div>

      {/* ── Filter rows ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">

        {/* ROW 1 ─────────────────────────────────────────────────────────── */}
        <div className="flex items-end gap-3 px-5 pt-3 pb-2 flex-wrap">

          <Field label="Date From">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => set("dateFrom", e.target.value)}
              className={inputCls}
              style={INPUT_STYLE}
            />
          </Field>

          <Field label="Date To">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => set("dateTo", e.target.value)}
              className={inputCls}
              style={INPUT_STYLE}
            />
          </Field>

          <Divider />

          <GranularityToggle
            value={filters.granularity}
            onChange={(v) => set("granularity", v)}
          />

          <Divider />

          <Field label="Brand (TBC)">
            <select
              value={filters.brand}
              onChange={(e) => set("brand", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
            >
              <option value="all">All Brands</option>
              <option value="playabets_ng">PlayaBets NG</option>
              <option value="playabets_gh">PlayaBets GH</option>
              <option value="playabets_zm">PlayaBets ZM</option>
              <option value="playabets_ug">PlayaBets UG</option>
              <option value="playabets_ke">PlayaBets KE</option>
            </select>
          </Field>

          <Field label="Territory">
            <select
              value={filters.territory}
              onChange={(e) => set("territory", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
            >
              <option value="all">All Territories</option>
              <option value="west_africa">West Africa</option>
              <option value="east_africa">East Africa</option>
              <option value="southern_africa">Southern Africa</option>
            </select>
          </Field>

          <Field label="Country">
            <select
              value={filters.country}
              onChange={(e) => set("country", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
            >
              <option value="all">All Countries</option>
              <option value="NG">Nigeria</option>
              <option value="GH">Ghana</option>
              <option value="ZM">Zambia</option>
              <option value="UG">Uganda</option>
              <option value="KE">Kenya</option>
            </select>
          </Field>

        </div>

        {/* ROW 2 ─────────────────────────────────────────────────────────── */}
        <div
          className="flex items-end gap-3 px-5 pt-2 pb-3 flex-wrap"
          style={{ borderTop: "1px solid oklch(1 0 0 / 5%)" }}
        >

          <Field label="Traffic Source (TBC)">
            <select
              value={filters.trafficSource}
              onChange={(e) => set("trafficSource", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
            >
              <option value="all">All Sources</option>
              <option value="organic">Organic</option>
              <option value="paid">Paid</option>
              <option value="affiliate">Affiliate</option>
              <option value="direct">Direct</option>
              <option value="social">Social</option>
            </select>
          </Field>

          <Field label="Affiliate (TBC)">
            <select
              value={filters.affiliateId}
              onChange={(e) => set("affiliateId", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
            >
              <option value="all">All Affiliates</option>
              <option value="aff_001">Affiliate 001</option>
              <option value="aff_002">Affiliate 002</option>
              <option value="aff_003">Affiliate 003</option>
            </select>
          </Field>

          <Divider />

          <Field label="User Segment (TBC)">
            <select
              value={filters.currentSegment}
              onChange={(e) => set("currentSegment", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
            >
              <option value="all">All Segments</option>
              <option value="VIP">VIP</option>
              <option value="PVIP">PVIP</option>
              <option value="Mass">Mass</option>
              <option value="Mix">Mix</option>
            </select>
          </Field>

          <Field label="Customer Status">
            <select
              value={filters.customerStatus}
              onChange={(e) => set("customerStatus", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="dormant">Dormant</option>
              <option value="blocked">Blocked</option>
            </select>
          </Field>

          {/* Reset button — aligned to bottom of row, only when filters active */}
          {hasActiveFilters && (
            <div className="flex flex-col justify-end flex-shrink-0">
              <button
                onClick={() => onChange(resetTo)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
                style={{
                  background: "oklch(0.55 0.22 25 / 15%)",
                  color: "oklch(0.70 0.18 25)",
                  border: "1px solid oklch(0.55 0.22 25 / 25%)",
                }}
              >
                <RotateCcw size={11} />
                Reset All
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
