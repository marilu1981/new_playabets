/**
 * Shared Supabase REST helper for Vercel API routes (CommonJS).
 * Uses the service-role key server-side — never exposed to the browser.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supaQuery(table, opts = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("select", opts.select ?? "*");
  if (opts.filters) {
    for (const f of opts.filters) {
      const eqIdx = f.indexOf("=");
      const col = f.substring(0, eqIdx);
      const val = f.substring(eqIdx + 1);
      // Use append (not set) so multiple filters on the same column (gte + lte) are both sent
      url.searchParams.append(col, val);
    }
  }
  if (opts.order) url.searchParams.set("order", opts.order);
  if (opts.limit) url.searchParams.set("limit", String(opts.limit));

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
  return res.json();
}

function sum(rows, col) {
  return rows.reduce((acc, r) => acc + Number(r[col] ?? 0), 0);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

module.exports = { supaQuery, sum, corsHeaders };
