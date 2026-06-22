/**
 * PLAYA BETS ANALYTICS DASHBOARD
 * TopFiltersBar — Label-above-control stacked layout.
 * All controls share a standard width (140px dropdowns, 130px date inputs).
 * Labels sit in small caps above each control — no inline labels, no abbreviations.
 *
 * Row 1: Date From | Date To | Granularity | Territory | Country | [Reset]
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
  dateFrom: "2026-01-01",
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
  background: "#ffffff",
  borderBottom: "1px solid #e4ece4",
};

// Standard control width — all dropdowns and date inputs use this
const CTRL_W = 140;

const INPUT_STYLE: React.CSSProperties = {
  background: "#f4f6f4",
  color: "#111111",
  border: "1px solid #d0ddd0",
  colorScheme: "light",
  width: `${CTRL_W}px`,
};

const SELECT_STYLE: React.CSSProperties = {
  background: "#f4f6f4",
  color: "#111111",
  border: "1px solid #d0ddd0",
  width: `${CTRL_W}px`,
};

const LABEL_STYLE: React.CSSProperties = {
  color: "#7ab800",
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
      background: "#e4ece4",
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
        background: value === v ? "#7ab800" : "#f4f6f4",
        color: value === v ? "#000000" : "#555555",
        border: `1px solid ${value === v ? "#7ab800" : "#d0ddd0"}`,
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
    filters.territory !== "all" ||
    filters.country !== "all";

  return (
    <div className="flex flex-shrink-0" style={BAR_BG}>

      {/* ── Vertical "Filters & Controls" label ───────────────────────────── */}
      <div
        className="flex items-center justify-center flex-shrink-0 px-3"
        style={{ borderRight: "1px solid #e4ece4", minWidth: "36px" }}
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
            style={{ color: "#7ab800", transform: "rotate(90deg)" }}
          />
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#7ab800",
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

          <Field label="Territory (Confirm grouping)">
            <select
              value={filters.territory}
              onChange={(e) => set("territory", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
              title="Confirm Country grouping — territory mapping pending DWH confirmation"
            >
              <option value="all">All Territories</option>
              <option value="west_africa">West Africa</option>
              <option value="east_africa">East Africa</option>
              <option value="southern_africa">Southern Africa</option>
            </select>
          </Field>

          <Field label="Country (Confirm grouping)">
            <select
              value={filters.country}
              onChange={(e) => set("country", e.target.value)}
              className={selectCls}
              style={SELECT_STYLE}
              title="Confirm Country grouping — country filter pending DWH column mapping"
            >
              <option value="all">All Countries</option>
              <option value="NG">Nigeria</option>
              <option value="GH">Ghana</option>
              <option value="ZM">Zambia</option>
              <option value="UG">Uganda</option>
              <option value="KE">Kenya</option>
              <option value="ZA">South Africa</option>
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
