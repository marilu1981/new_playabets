'use strict';
/**
 * /api/betting/betslips-by-status
 * Returns betslip status breakdown from daily_kpis.
 *
 * Preferred: uses betslips_won_count / betslips_cancelled_count / betslips_settled_count
 * columns added by the updated ETL (betslips_kpis.py).
 *
 * Fallback: when those columns are zero/missing, estimates from stake-based rates:
 *   win_rate = winning_stake / settled_stake   (stake proportion)
 *   cancel_rate = cancelled_stake / settled_stake  (stake proportion)
 * Rates are weighted by settled_stake and applied to the settled portion of betslips.
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

    // Try to fetch count-based columns added by the updated ETL.
    // Fall back to base columns if the schema hasn't been migrated yet.
    let rows;
    let hasCountData = false;
    try {
      rows = await supaQuery("daily_kpis", {
        select: "betslips_count,cancel_rate,win_rate,open_exposure_stake,settled_stake,betslips_won_count,betslips_cancelled_count,betslips_settled_count",
        filters,
      });
      hasCountData = sum(rows, "betslips_settled_count") > 0;
    } catch {
      rows = await supaQuery("daily_kpis", {
        select: "betslips_count,cancel_rate,win_rate,open_exposure_stake,settled_stake",
        filters,
      });
    }

    const totalBetslips   = sum(rows, "betslips_count");
    const totalSettled    = sum(rows, "settled_stake");
    const totalExposure   = sum(rows, "open_exposure_stake");

    // Open betslips estimate: exposure / (exposure + settled) ratio applied to placed count.
    const openEstimate = (totalSettled + totalExposure) > 0
      ? Math.round(totalBetslips * (totalExposure / (totalSettled + totalExposure)))
      : 0;

    let won, cancelled, lost;
    if (hasCountData) {
      // Accurate count-based breakdown from updated ETL columns.
      const countWon       = sum(rows, "betslips_won_count");
      const countCancelled = sum(rows, "betslips_cancelled_count");
      const countSettled   = sum(rows, "betslips_settled_count");
      won       = countWon;
      cancelled = countCancelled;
      lost      = Math.max(0, countSettled - won - cancelled);
    } else {
      // Fallback: stake-based rate estimation.
      // win_rate = winning_stake / settled_stake (stake proportion, not count proportion).
      // Weight by settled_stake for a correct overall average.
      const avgWinRate = totalSettled > 0
        ? rows.reduce((acc, r) => acc + Number(r.win_rate ?? 0) * Number(r.settled_stake ?? 0), 0) / totalSettled
        : 0;
      const avgCancelRate = totalSettled > 0
        ? rows.reduce((acc, r) => acc + Number(r.cancel_rate ?? 0) * Number(r.settled_stake ?? 0), 0) / totalSettled
        : 0;
      const settledEstimate = Math.max(0, totalBetslips - openEstimate);
      won       = Math.round(settledEstimate * avgWinRate);
      cancelled = Math.round(settledEstimate * avgCancelRate);
      lost      = Math.max(0, settledEstimate - won - cancelled);
    }

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
