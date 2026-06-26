/**
 * Persistent insights cache — stores AI insights in localStorage per page+period.
 * Prevents re-fetching insights on every page load for the same date range.
 * Cache key: page + dateFrom + dateTo + a hash of key metric values.
 */
import type { AiInsights } from "@/lib/generateReport";

const CACHE_VERSION = "v4"; // bumped: alerts replaces concerns, recommendations removed

function cacheKey(page: string, dateFrom: string, dateTo: string, metricHash: string): string {
  return `pb_insights_${CACHE_VERSION}_${page}_${dateFrom}_${dateTo}_${metricHash}`;
}

function hashMetrics(...values: (number | string)[]): string {
  // Simple hash — just round to nearest 1000 and join
  return values.map(v => typeof v === "number" ? Math.round(v / 1000) : v).join("_");
}

export function getCachedInsights(
  page: string,
  dateFrom: string,
  dateTo: string,
  ...metricValues: number[]
): AiInsights | null {
  try {
    const key = cacheKey(page, dateFrom, dateTo, hashMetrics(...metricValues));
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    return JSON.parse(stored) as AiInsights;
  } catch {
    return null;
  }
}

export function setCachedInsights(
  page: string,
  dateFrom: string,
  dateTo: string,
  insights: AiInsights,
  ...metricValues: number[]
): void {
  try {
    const key = cacheKey(page, dateFrom, dateTo, hashMetrics(...metricValues));
    localStorage.setItem(key, JSON.stringify(insights));
  } catch {}
}
