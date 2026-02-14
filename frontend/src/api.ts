/// <reference types="node" />

const BASE =
  (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
  "http://127.0.0.1:8000";

export async function getKpis(start: string, end: string) {
  const res = await fetch(`${BASE}/kpis?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  if (!res.ok) throw new Error("Failed to fetch KPIs");
  return res.json();
}

export interface KpisLatest {
  date: string;
  [key: string]: string | number | undefined;
}

export async function getKpisLatest(): Promise<KpisLatest> {
  const res = await fetch(`${BASE}/kpis/latest`);
  if (!res.ok) throw new Error("Failed to fetch latest KPIs");
  return res.json();
}

export interface KpisSeriesPoint {
  date: string;
  value: number | null;
}

export async function getKpisSeries(
  metric: string,
  days = 30
): Promise<{ metric: string; days: number; points: KpisSeriesPoint[] }> {
  const res = await fetch(
    `${BASE}/kpis/series?metric=${encodeURIComponent(metric)}&days=${days}`
  );
  if (!res.ok) throw new Error(`Failed to fetch KPI series: ${metric}`);
  return res.json();
}

export async function fetchRfmSegments() {
  const res = await fetch(`${BASE}/rfm/segments`);
  if (!res.ok) throw new Error(`rfm/segments failed: ${res.status}`);
  const json = await res.json();
  return json.segments ?? [];
}

export async function fetchRollingKpis(params?: { limit?: number; start?: string; end?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.start) qs.set("start", params.start);
  if (params?.end) qs.set("end", params.end);
  const res = await fetch(`${BASE}/kpis/rolling?${qs.toString()}`);
  if (!res.ok) throw new Error(`kpis/rolling failed: ${res.status}`);
  const json = await res.json();
  return json.rows ?? [];
}

export interface DailyKpiRow {
  date: string;
  registrations: number;
  settled_winnings: number;
  win_rate: number;
  ggr: number;
  [key: string]: string | number | undefined;
}

export async function fetchDailyKpis(params?: { 
  start?: string; 
  end?: string; 
  metrics?: string[];
}): Promise<DailyKpiRow[]> {
  const qs = new URLSearchParams();
  if (params?.start) qs.set("start", params.start);
  if (params?.end) qs.set("end", params.end);
  if (params?.metrics) qs.set("metrics", params.metrics.join(","));
  
  const res = await fetch(`${BASE}/kpis/daily?${qs.toString()}`);
  if (!res.ok) throw new Error(`kpis/daily failed: ${res.status}`);
  const json = await res.json();
  return json.rows ?? [];
}
