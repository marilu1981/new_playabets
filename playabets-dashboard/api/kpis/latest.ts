/**
 * GET /api/kpis/latest
 *
 * Returns the most recent date in the daily_kpis table.
 * Used by the Home page to display "data as of" and to initialise the date filter.
 *
 * Shape: { date: "YYYY-MM-DD" }
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
    const rows = await supaQuery("daily_kpis", {
      select: "date",
      order: "date.desc",
      limit: 1,
    });

    const date = rows.length > 0 ? String(rows[0].date) : null;
    return res.status(200).json({ date });
  } catch (err) {
    console.error("[/api/kpis/latest]", err);
    return res.status(500).json({ error: String(err) });
  }
}
