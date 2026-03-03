/**
 * GET /api/casino/kpis?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns aggregated casino KPIs for the Casino page.
 *
 * Shape: { stake, winnings, ggr, actives, bets, hold_pct }
 *
 * Source: casino_daily
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

    const rows = await supaQuery("casino_daily", { filters });

    const stake    = sum(rows, "casino_stake");
    const winnings = sum(rows, "casino_winnings");
    const ggr      = sum(rows, "casino_ggr");
    const actives  = sum(rows, "casino_actives");
    const bets     = sum(rows, "casino_bets");
    const hold_pct = stake > 0 ? Number(((ggr / stake) * 100).toFixed(2)) : 0;

    return res.status(200).json({ stake, winnings, ggr, actives, bets, hold_pct });
  } catch (err) {
    console.error("[/api/casino/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
}
