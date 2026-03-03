/**
 * GET /api/kpis/daily?start=YYYY-MM-DD&end=YYYY-MM-DD&metrics=...
 *
 * Returns daily sportsbook rows for revenue trend charts.
 * Shape: { rows: Array<{ date, placed_stake, settled_stake, settled_winnings, ggr, betslips_count }> }
 *
 * Source: daily_kpis
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supaQuery, corsHeaders } from "../_supabase";

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

    const rows = await supaQuery("daily_kpis", {
      select: "date,placed_stake,settled_stake,settled_winnings,ggr,betslips_count",
      filters,
      order: "date.asc",
    });

    return res.status(200).json({ rows });
  } catch (err) {
    console.error("[/api/kpis/daily]", err);
    return res.status(500).json({ error: String(err) });
  }
}
