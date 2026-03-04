import type { DashboardFilters } from "@/components/TopFiltersBar";

const BRAND_MAP: Record<string, string> = {
  playabets_ng: "PlayaBets NG",
  playabets_gh: "PlayaBets GH",
  playabets_zm: "PlayaBets ZM",
  playabets_ug: "PlayaBets UG",
  playabets_ke: "PlayaBets KE",
};

const TERRITORY_MAP: Record<string, string> = {
  west_africa: "West Africa",
  east_africa: "East Africa",
  southern_africa: "Southern Africa",
};

const COUNTRY_MAP: Record<string, string> = {
  NG: "Nigeria",
  GH: "Ghana",
  ZM: "Zambia",
  UG: "Uganda",
  KE: "Kenya",
  ZA: "South Africa",
};

const TRAFFIC_MAP: Record<string, string> = {
  organic: "Organic",
  paid: "Paid",
  affiliate: "Affiliate",
  direct: "Direct",
  social: "Social",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseDateValue(value: string | undefined, fallbackYear?: number): Date | null {
  if (!value) {
    return null;
  }
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dt = new Date(`${raw}T00:00:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  if (/^\d{4}-\d{2}-\d{2}\s/.test(raw)) {
    const dt = new Date(raw.replace(" ", "T"));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const monthYear = Date.parse(`1 ${raw}`);
  if (!Number.isNaN(monthYear)) {
    return new Date(monthYear);
  }

  if (fallbackYear && /^[A-Za-z]{3}$/.test(raw)) {
    const monthOnly = Date.parse(`${raw} 1, ${fallbackYear}`);
    if (!Number.isNaN(monthOnly)) {
      return new Date(monthOnly);
    }
  }

  return null;
}

function isAll(filterValue: string): boolean {
  return filterValue === "all";
}

function sameFilterValue(filterValue: string, rowValue: string | undefined, map: Record<string, string> = {}): boolean {
  if (isAll(filterValue) || !rowValue) {
    return true;
  }
  const mappedFilter = map[filterValue] ?? filterValue;
  return normalize(mappedFilter) === normalize(rowValue);
}

export function matchesRowFilters(
  filters: DashboardFilters,
  row: {
    brand?: string;
    territory?: string;
    country?: string;
    trafficSource?: string;
    segment?: string;
    status?: string;
  },
): boolean {
  if (!sameFilterValue(filters.brand, row.brand, BRAND_MAP)) {
    return false;
  }
  if (!sameFilterValue(filters.territory, row.territory, TERRITORY_MAP)) {
    return false;
  }
  if (!sameFilterValue(filters.country, row.country, COUNTRY_MAP)) {
    return false;
  }
  if (!sameFilterValue(filters.trafficSource, row.trafficSource, TRAFFIC_MAP)) {
    return false;
  }
  if (!sameFilterValue(filters.currentSegment, row.segment)) {
    return false;
  }
  if (!sameFilterValue(filters.customerStatus, row.status)) {
    return false;
  }
  return true;
}

function getDateSpanMultiplier(filters: DashboardFilters): number {
  const from = parseDateValue(filters.dateFrom);
  const to = parseDateValue(filters.dateTo);
  if (!from || !to) {
    return 1;
  }
  const ms = Math.abs(to.getTime() - from.getTime());
  const days = Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
  return clamp(days / 30, 0.2, 1.35);
}

export function getFilterMultiplier(filters: DashboardFilters): number {
  const selectedCount = [
    filters.brand,
    filters.territory,
    filters.country,
    filters.trafficSource,
    filters.affiliateId,
    filters.currentSegment,
    filters.customerStatus,
  ].filter((value) => value !== "all").length;

  let multiplier = 1;
  multiplier *= 1 - Math.min(selectedCount * 0.03, 0.27);
  multiplier *= getDateSpanMultiplier(filters);

  // Keep deterministic variance so different choices produce different results in mock mode.
  const fingerprint = [
    filters.brand,
    filters.territory,
    filters.country,
    filters.trafficSource,
    filters.affiliateId,
    filters.currentSegment,
    filters.customerStatus,
  ].join("|");
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash = (hash * 31 + fingerprint.charCodeAt(i)) >>> 0;
  }
  const variance = ((hash % 9) - 4) * 0.01;
  multiplier *= 1 + variance;

  return clamp(multiplier, 0.08, 1.6);
}

export function scaleNumber(value: number, multiplier: number): number {
  const scaled = value * multiplier;
  if (Number.isInteger(value)) {
    return Math.round(scaled);
  }
  return Number(scaled.toFixed(2));
}

export function scaleObjectNumericFields<T extends Record<string, unknown>>(
  row: T,
  multiplier: number,
  skip: readonly string[] = [],
): T {
  const skipSet = new Set(skip);
  const out = { ...row };
  Object.entries(row).forEach(([key, value]) => {
    if (skipSet.has(key)) {
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      (out as Record<string, unknown>)[key] = scaleNumber(value, multiplier);
    }
  });
  return out;
}

export function scaleArrayNumericFields<T extends Record<string, unknown>>(
  rows: T[],
  multiplier: number,
  skip: readonly string[] = [],
): T[] {
  return rows.map((row) => scaleObjectNumericFields(row, multiplier, skip));
}

export function filterByDateRange<T>(
  rows: T[],
  filters: DashboardFilters,
  getDate: (row: T) => string | undefined,
  options?: { fallbackYear?: number },
): T[] {
  const from = parseDateValue(filters.dateFrom);
  const to = parseDateValue(filters.dateTo);
  if (!from || !to) {
    return rows;
  }
  const min = from <= to ? from : to;
  const max = from <= to ? to : from;

  return rows.filter((row) => {
    const date = parseDateValue(getDate(row), options?.fallbackYear);
    if (!date) {
      return true;
    }
    return date >= min && date <= max;
  });
}
