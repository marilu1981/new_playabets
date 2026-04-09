import type { CSSProperties } from "react";
import { cachedFetch } from "@/lib/apiCache";
import { formatFull } from "@/lib/formatters";
import type { DashboardFilters } from "@/components/TopFiltersBar";

export const HERO_BG = "https://private-us-east-1.manuscdn.com/sessionFile/cKq6wfrB6w3tj51hFB9kbf/sandbox/bUQudPFuU0QLod3pzEsnEY-img-2_1771727908000_na1fn_cGxheWFiZXRzLWhlcm8tYmFubmVy.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvY0txNndmckI2dzN0ajUxaEZCOWtiZi9zYW5kYm94L2JVUXVkUEZ1VTBRTG9kM3B6RXNuRVktaW1nLTJfMTc3MTcyNzkwODAwMF9uYTFmbl9jR3hoZVdGaVpYUnpMV2hsY204dFltRnVibVZ5LnBuZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=LHsnks1NO7SQ87OPqfr8X3UCWGKR~-4dFr0yVglkj0GAbZntP4Bq2VV88L-8FWkj-8edRLrlOJK73a4zD7Y7gnEAI9d6hcIeI7KCSJrwwvRW6UB4wYIBKcBGFFUxVdkuimzCKyEvj9PaaWLFw9ouP3Vbvp~P0BXrFkfjceNgumru40JCmdXs7tF5ZUtwpNldD~AWzgTIY-AdzkE4FML0W4RYJRXT7w~1Qnz5onsasdZIf27SUcyL1J0I-hug5HoXudlGMHMVhXBfL68bTeaaUTETPQLgYKwGeKSdDqRDAWfCqjgqLVzCnAKBODZh2PIZGvl4Na8qo18vldMjr9oPZg__";

export const CHART_COLORS = {
  gold:  "#7ab800",   /* Playa Green — primary brand */
  green: "#3d8c2e",   /* darker green, readable on light bg */
  teal:  "#0d8f8f",
  amber: "#ffb500",   /* Sunny Yellow */
  red:   "#d94040",
};

export const CARD_BG: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e4ece4",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
};

export const FONT_SERIF: CSSProperties = {};
export const FONT_MONO: CSSProperties = {};

export const TT_STYLE: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dde8dd",
  color: "#111111",
  fontSize: 11,
  boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
};

export const COUNTRY_BRAND_MAP: Record<string, string> = {
  Nigeria: "PlayaBets NG",
  Ghana: "PlayaBets GH",
  Kenya: "PlayaBets KE",
  Uganda: "PlayaBets UG",
  Zambia: "PlayaBets ZM",
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");

export type DataMode = "mock" | "partial" | "live";

export type MetricRow = {
  metric: string;
  current: number;
  previous: number;
  ytd: number;
  isPercent?: boolean;
  isCurrency?: boolean;
};

export async function fetchJson<T>(path: string): Promise<T> {
  return cachedFetch<T>(`${API_BASE_URL}${path}`);
}

export function toIsoDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseSeriesDate(value: string | undefined, fallbackYear: number): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dt = new Date(`${raw}T00:00:00Z`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (/^\d{4}-\d{2}-\d{2}\s/.test(raw)) {
    const dt = new Date(raw.replace(" ", "T"));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  if (/^[A-Za-z]{3}$/.test(raw)) {
    const dt = new Date(`${raw} 1, ${fallbackYear} UTC`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) {
      const normalized = value.replace(/\//g, "-");
      const dt = new Date(`${normalized}T00:00:00Z`);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
    return null;
  }
  const dt = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function monthKey(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

export function filterMonthRows<T>(
  rows: T[],
  filters: DashboardFilters,
  getMonthValue: (row: T) => string | undefined,
  fallbackYear: number,
): T[] {
  const from = parseIsoDate(filters.dateFrom);
  const to = parseIsoDate(filters.dateTo);
  if (!from || !to) return rows;

  const min = Math.min(monthKey(from), monthKey(to));
  const max = Math.max(monthKey(from), monthKey(to));
  const monthOnly = rows.every((row) => /^[A-Za-z]{3}$/.test((getMonthValue(row) ?? "").trim()));
  if (!monthOnly) {
    return rows.filter((row) => {
      const dt = parseSeriesDate(getMonthValue(row), fallbackYear);
      if (!dt) return true;
      const mk = monthKey(dt);
      return mk >= min && mk <= max;
    });
  }

  const monthIndex = (value: string): number =>
    new Date(`${value} 1, 2000 UTC`).getUTCMonth();

  const resolved: number[] = new Array(rows.length).fill(fallbackYear);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (i === rows.length - 1) {
      resolved[i] = fallbackYear;
    } else {
      const current = monthIndex(String(getMonthValue(rows[i]) ?? "Jan"));
      const next = monthIndex(String(getMonthValue(rows[i + 1]) ?? "Jan"));
      resolved[i] = current > next ? resolved[i + 1] - 1 : resolved[i + 1];
    }
  }

  return rows.filter((row, idx) => {
    const m = String(getMonthValue(row) ?? "").trim();
    const dt = parseSeriesDate(m, resolved[idx]);
    if (!dt) return true;
    const mk = monthKey(dt);
    return mk >= min && mk <= max;
  });
}

function bucketStart(date: Date, granularity: DashboardFilters["granularity"]): Date {
  const out = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (granularity === "monthly") {
    return new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth(), 1));
  }
  if (granularity === "weekly") {
    const day = out.getUTCDay();
    const mondayOffset = (day + 6) % 7;
    out.setUTCDate(out.getUTCDate() - mondayOffset);
  }
  return out;
}

export function aggregateByGranularity<T extends Record<string, unknown>>(
  rows: T[],
  granularity: DashboardFilters["granularity"],
  getDate: (row: T) => string | undefined,
  options?: {
    fallbackYear?: number;
    labelKey?: string;
    avgFields?: string[];
  },
): T[] {
  if (granularity === "daily") return rows;

  const labelKey = options?.labelKey ?? "date";
  const avgFields = new Set(options?.avgFields ?? []);
  const fallbackYear = options?.fallbackYear ?? new Date().getFullYear();
  const grouped = new Map<string, { sample: T; sums: Record<string, number>; counts: Record<string, number> }>();

  rows.forEach((row) => {
    const date = parseSeriesDate(getDate(row), fallbackYear);
    if (!date) return;

    const key = toIsoDate(bucketStart(date, granularity));
    const entry = grouped.get(key) ?? { sample: row, sums: {}, counts: {} };

    Object.entries(row).forEach(([field, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        entry.sums[field] = (entry.sums[field] ?? 0) + value;
        entry.counts[field] = (entry.counts[field] ?? 0) + 1;
      }
    });

    grouped.set(key, entry);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => {
      const out: Record<string, unknown> = { ...entry.sample, [labelKey]: key };
      Object.entries(out).forEach(([field, value]) => {
        if (typeof value === "number" && Number.isFinite(value) && entry.sums[field] !== undefined) {
          const summed = entry.sums[field];
          if (avgFields.has(field)) {
            const avg = summed / Math.max(1, entry.counts[field] ?? 1);
            out[field] = Number(avg.toFixed(1));
          } else {
            out[field] = Number.isInteger(value) ? Math.round(summed) : Number(summed.toFixed(2));
          }
        }
      });
      return out as T;
    });
}

export function toggleBtn(active: boolean): CSSProperties {
  return {
    background: active ? "#7ab800" : "#f0f5f0",
    color: active ? "#000000" : "#555555",
    border: `1px solid ${active ? "#7ab800" : "#d0ddd0"}`,
    fontWeight: active ? 700 : 500,
    transition: "all 0.15s",
    cursor: "pointer",
    padding: "3px 10px",
    borderRadius: "4px",
    fontSize: "11px",
  };
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return parseFloat(((current - previous) / Math.abs(previous) * 100).toFixed(1));
}

/** Returns true when the previous value is too sparse to produce a meaningful change %. */
export function isPctChangeReliable(current: number, previous: number): boolean {
  if (previous === 0) return current === 0;
  const chg = Math.abs((current - previous) / Math.abs(previous) * 100);
  // If previous is less than 5% of current, prior period had negligible volume
  if (current !== 0 && Math.abs(previous) < Math.abs(current) * 0.05) return false;
  // Cap at ±500% — beyond that the comparison is not useful
  return chg <= 500;
}

export function fmtMetric(val: number, row: MetricRow): string {
  if (row.isPercent) return `${val.toFixed(1)}%`;
  return formatFull(val);
}
