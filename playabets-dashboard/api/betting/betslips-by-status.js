'use strict';
/**
 * /api/betting/betslips-by-status
 * Derives betslip status breakdown from daily_kpis aggregates.
 * Uses betslips_count, cancel_rate, and win_rate to estimate:
 *   Won / Lost / Cancelled / Open (exposure)
 * NOTE: This is a derived approximation until a dedicated betslip-status
 *       table is available from the DWH view_Betslips extract.
 */
const { supaQuery, sum, corsHeaders } = require("../_supabase");

// Simple 60-second in-memory cache
const cache = new Map();
const CACHE_TTL_MS = 60_000;

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    return res.status(200).end();
  }
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  try {
    const start = String(req.query.start ?? "");
    const end   = String(req.query.end   ?? "");
    const cacheKey = `betslip-status:${start}:${end}`;

    // Return cached response if fresh
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.status(200).json(cached.data);
    }

    const filters = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end)   filters.push(`date=lte.${end}`);

    const rows = await supaQuery("daily_kpis", {
      select: "betslips_count,cancel_rate,win_rate,open_exposure_stake,settled_stake",
      filters,
    });

    const totalBetslips = sum(rows, "betslips_count");
    // Average rates across days (weighted by betslip count)
    const avgCancelRate = totalBetslips > 0
      ? rows.reduce((acc, r) => acc + Number(r.cancel_rate ?? 0) * Number(r.betslips_count ?? 0), 0) / totalBetslips
      : 0;
    const avgWinRate = totalBetslips > 0
      ? rows.reduce((acc, r) => acc + Number(r.win_rate ?? 0) * Number(r.betslips_count ?? 0), 0) / totalBetslips
      : 0;

    // Derive status counts from rates
    const cancelled = Math.round(totalBetslips * avgCancelRate);
    const settled   = totalBetslips - cancelled;
    const won       = Math.round(settled * avgWinRate);
    const lost      = settled - won;

    // Open betslips: estimate from exposure vs settled ratio
    const totalExposure = sum(rows, "open_exposure_stake");
    const totalSettled  = sum(rows, "settled_stake");
    const openEstimate  = totalSettled > 0
      ? Math.round(totalBetslips * (totalExposure / (totalSettled + totalExposure)))
      : 0;

    const result = [
      { status: "Won",       statusId: 5, count: Math.max(0, won) },
      { status: "Lost",      statusId: 6, count: Math.max(0, lost) },
      { status: "Cancelled", statusId: 4, count: Math.max(0, cancelled) },
      { status: "Open",      statusId: 1, count: Math.max(0, openEstimate) },
    ].filter((s) => s.count > 0);

    cache.set(cacheKey, { ts: Date.now(), data: result });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[/api/betting/betslips-by-status]", err);
    return res.status(500).json({ error: String(err) });
  }
};
