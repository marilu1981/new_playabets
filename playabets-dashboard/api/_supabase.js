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

/**
 * Fetches ALL rows from a Supabase table, paginating past the default 1000-row
 * REST limit using Range headers. The combined result is cached for CACHE_TTL_MS.
 */
async function supaQueryAll(table, opts = {}) {
  const PAGE_SIZE = 1000;
  const cacheKey = `paginated:${table}:${opts.select ?? "*"}:${JSON.stringify(opts.filters ?? [])}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let offset = 0;
  let total = null;
  const allRows = [];

  while (true) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set("select", opts.select ?? "*");
    if (opts.filters) {
      for (const f of opts.filters) {
        const eqIdx = f.indexOf("=");
        url.searchParams.append(f.substring(0, eqIdx), f.substring(eqIdx + 1));
      }
    }
    if (opts.order) url.searchParams.set("order", opts.order);

    const res = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "count=exact",
        "Range": `${offset}-${offset + PAGE_SIZE - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase ${table} ${res.status}: ${text}`);
    }

    const page = await res.json();
    if (Array.isArray(page)) allRows.push(...page);

    // Parse total from Content-Range: "items 0-999/5000"
    if (total === null) {
      const cr = res.headers.get("content-range") ?? res.headers.get("Content-Range");
      if (cr) {
        const m = cr.match(/\/(\d+)$/);
        if (m) total = parseInt(m[1], 10);
      }
    }

    offset += PAGE_SIZE;
    if (total !== null && allRows.length >= total) break;
    if (!Array.isArray(page) || page.length < PAGE_SIZE) break;
  }

  cacheSet(cacheKey, allRows);
  return allRows;
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

module.exports = { supaQuery, supaQueryAll, sum, corsHeaders, cacheGet, cacheSet, CACHE_TTL_MS };
