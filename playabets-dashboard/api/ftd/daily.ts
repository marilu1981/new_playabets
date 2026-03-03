/**
 * GET /api/ftd/daily?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns daily FTD counts.
 * Shape: { points: Array<{ date, ftds }> }
 *
 * Source: ftd_daily
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

    const rows = await supaQuery("ftd_daily", {
      select: "date,ftds",
      filters,
      order: "date.asc",
    });

    const points = rows.map((r) => ({
      date: String(r.date),
      ftds: Number(r.ftds ?? 0),
    }));

    return res.status(200).json({ points });
  } catch (err) {
    console.error("[/api/ftd/daily]", err);
    return res.status(500).json({ error: String(err) });
  }
}
