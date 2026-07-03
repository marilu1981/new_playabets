/**
 * Persistent insights cache - stores AI insights in localStorage per page+period+metrics.
 *
 * Cache key = page + dateFrom + dateTo + rounded metric values.
 * - Date changes -> new key -> new fetch automatically.
 * - Metric values change (new pipeline run) -> new key -> new fetch automatically.
 * - No manual version bumping needed.
 *
 * Old keys accumulate silently in localStorage but are small (< 2KB each) and
 * browsers evict LRU when storage is full.
 */
import type { AiInsights } from "@/lib/generateReport";

const PREFIX = "pb_insights";

function buildKey(page: string, dateFrom: string, dateTo: string, ...metricValues: number[]): string {
  // Round each metric to nearest 1000 so minor pipeline fluctuations don't bust the cache
  const hash = metricValues.map(v => String(Math.round(v / 1000))).join("_");
  return `${PREFIX}_${page}_${dateFrom}_${dateTo}_${hash}`;
}

export function getCachedInsights(
  page: string,
  dateFrom: string,
  dateTo: string,
  ...metricValues: number[]
): AiInsights | null {
  try {
    const stored = localStorage.getItem(buildKey(page, dateFrom, dateTo, ...metricValues));
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
    localStorage.setItem(buildKey(page, dateFrom, dateTo, ...metricValues), JSON.stringify(insights));
  } catch {}
}
