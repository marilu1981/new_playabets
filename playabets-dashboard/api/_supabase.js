/**
 * Shared Supabase REST helper for Vercel API routes (CommonJS).
 * Uses the service-role key server-side - never exposed to the browser.
 *
 * Includes a 60-second in-memory cache (per Vercel function instance)
 * to avoid redundant Supabase queries on repeated page loads.
 */
'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// -- In-memory cache ---------------------------------------------------------------------------------
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

// -- Supabase REST query -------------------------------------------------------------------------------
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
    console.error(`Supabase query failed [${table}] ${res.status}: ${text}`);
    throw new Error(`Data query failed (${res.status})`);
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
      console.error(`Supabase paginated query failed [${table}] ${res.status}: ${text}`);
      throw new Error(`Data query failed (${res.status})`);
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

// -- Auth -----------------------------------------------------------------------------------------
/**
 * Check API key. Returns true (and sends 401) if the request is rejected.
 * Returns false if auth passes or is disabled (no API_KEY env var set).
 * Usage: if (requireAuth(req, res)) return;
 */
function requireAuth(req, res) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return false; // disabled in dev
  const provided = req.headers['x-api-key'] || '';
  const auth = req.headers['authorization'] || '';
  const token = provided || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (token !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return true;
  }
  return false;
}

// -- Helpers --------------------------------------------------------------------------------------
function sum(rows, col) {
  return rows.reduce((acc, r) => acc + Number(r[col] ?? 0), 0);
}

const _ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000,https://new-playabets-marilus-projects.vercel.app,https://new-playabets.vercel.app"
)
  .split(",")
  .map((s) => s.trim());

function corsHeaders(req) {
  const origin = req?.headers?.origin ?? "";
  const allowed = _ALLOWED_ORIGINS.includes(origin) ? origin : _ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

module.exports = { supaQuery, supaQueryAll, sum, corsHeaders, cacheGet, cacheSet, CACHE_TTL_MS, requireAuth };
