/**
 * GET /api/sportsbook/kpis?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns aggregated sportsbook KPIs for the Betting page.
 *
 * Shape: {
 *   betslips_count, placed_stake, settled_stake, settled_winnings,
 *   ggr, hold_pct, win_rate, cancel_rate, actives
 * }
 *
 * Source: daily_kpis
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supaQuery, sum, corsHeaders } from "../_supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const filters: string[] = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end)   filters.push(`date=lte.${end}`);

    const rows = await supaQuery("daily_kpis", { filters });

    const betslips_count  = sum(rows, "betslips_count");
    const placed_stake    = sum(rows, "placed_stake");
    const settled_stake   = sum(rows, "settled_stake");
    const settled_winnings = sum(rows, "settled_winnings");
    const ggr             = sum(rows, "ggr");
    const actives         = sum(rows, "actives_sports");

    // Weighted averages for rates
    const hold_pct    = settled_stake > 0 ? Number(((ggr / settled_stake) * 100).toFixed(2)) : 0;
    const win_rate    = rows.length > 0
      ? Number((rows.reduce((a, r) => a + Number(r.win_rate    ?? 0), 0) / rows.length).toFixed(2))
      : 0;
    const cancel_rate = rows.length > 0
      ? Number((rows.reduce((a, r) => a + Number(r.cancel_rate ?? 0), 0) / rows.length).toFixed(2))
      : 0;

    return res.status(200).json({
      betslips_count,
      placed_stake,
      settled_stake,
      settled_winnings,
      ggr,
      hold_pct,
      win_rate,
      cancel_rate,
      actives,
    });
  } catch (err) {
    console.error("[/api/sportsbook/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
}
