/**
 * GET /api/casino/daily?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns daily casino rows for the revenue trend chart.
 * Shape: { points: Array<{ date, stake, winnings, ggr }> }
 *
 * Source: casino_daily
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

    const rows = await supaQuery("casino_daily", {
      select: "date,casino_stake,casino_winnings,casino_ggr,casino_actives,casino_bets",
      filters,
      order: "date.asc",
    });

    const points = rows.map((r) => ({
      date:     String(r.date),
      stake:    Number(r.casino_stake    ?? 0),
      winnings: Number(r.casino_winnings ?? 0),
      ggr:      Number(r.casino_ggr      ?? 0),
      actives:  Number(r.casino_actives  ?? 0),
      bets:     Number(r.casino_bets     ?? 0),
    }));

    return res.status(200).json({ points });
  } catch (err) {
    console.error("[/api/casino/daily]", err);
    return res.status(500).json({ error: String(err) });
  }
}
