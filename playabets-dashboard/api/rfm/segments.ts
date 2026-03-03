/**
 * GET /api/rfm/segments?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns the latest RFM segment snapshot counts from daily_kpis.
 * Uses the most recent row in the date range.
 *
 * Shape: {
 *   champions, loyal, big_spenders, mid, at_risk, dormant,
 *   active_7d, active_30d, dormant_30d
 * }
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

    // Get the latest row in the range for the snapshot
    const rows = await supaQuery("daily_kpis", {
      select: "date,rfm_champions,rfm_loyal,rfm_big_spenders,rfm_mid,rfm_at_risk,rfm_dormant,rfm_active_7d,rfm_active_30d,rfm_dormant_30d",
      filters,
      order: "date.desc",
      limit: 1,
    });

    if (rows.length === 0) {
      return res.status(200).json(null);
    }

    const r = rows[0];
    return res.status(200).json({
      date:         String(r.date),
      champions:    Number(r.rfm_champions    ?? 0),
      loyal:        Number(r.rfm_loyal        ?? 0),
      big_spenders: Number(r.rfm_big_spenders ?? 0),
      mid:          Number(r.rfm_mid          ?? 0),
      at_risk:      Number(r.rfm_at_risk      ?? 0),
      dormant:      Number(r.rfm_dormant      ?? 0),
      active_7d:    Number(r.rfm_active_7d    ?? 0),
      active_30d:   Number(r.rfm_active_30d   ?? 0),
      dormant_30d:  Number(r.rfm_dormant_30d  ?? 0),
    });
  } catch (err) {
    console.error("[/api/rfm/segments]", err);
    return res.status(500).json({ error: String(err) });
  }
}
