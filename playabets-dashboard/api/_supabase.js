/**
 * Shared Supabase REST helper for Vercel API routes (CommonJS).
 * Uses the service-role key server-side — never exposed to the browser.
 *
 * Includes a 60-second in-memory cache (per Vercel function instance)
 * to avoid redundant Supabase queries on repeated page loads.
 */
'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── In-memory cache ─────────────────────────────────────────────────────────────────────────────────
const _cache = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  _cache.set(key, { ts: Date.now(), data });
}

// ── Supabase REST query ───────────────────────────────────────────────────────────────────────────────
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

  // Cache key = full URL (includes table, filters, select)
  const cacheKey = url.toString();
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

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
  const data = await res.json();
  cacheSet(cacheKey, data);
  return data;
}

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────────
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

module.exports = { supaQuery, sum, corsHeaders, cacheGet, cacheSet, CACHE_TTL_MS };
