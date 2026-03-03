/**
 * Shared Supabase REST helper for Vercel API routes.
 * Uses the service-role key server-side — never exposed to the browser.
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export interface QueryOptions {
  select?: string;
  filters?: string[]; // PostgREST filter strings e.g. "date=gte.2025-01-01"
  order?: string;     // e.g. "date.asc"
  limit?: number;
}

export async function supaQuery<T = Record<string, unknown>>(
  table: string,
  opts: QueryOptions = {}
): Promise<T[]> {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("select", opts.select ?? "*");
  if (opts.filters) {
    for (const f of opts.filters) {
      const [col, val] = f.split("=");
      url.searchParams.set(col, val);
    }
  }
  if (opts.order) url.searchParams.set("order", opts.order);
  if (opts.limit)  url.searchParams.set("limit", String(opts.limit));

  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${table} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T[]>;
}

export function sum(rows: Record<string, unknown>[], col: string): number {
  return rows.reduce((acc, r) => acc + Number(r[col] ?? 0), 0);
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}
