/**
 * GET /api/timeseries/registrations?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns daily registrations and FTDs for the Player Acquisition chart
 * and Conversion Rate trend.
 *
 * Shape: {
 *   registrations: Array<{ date, value }>,
 *   ftds:          Array<{ date, value }>
 * }
 *
 * Sources: daily_kpis (registrations) + ftd_daily (ftds)
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

    const [kpiRows, ftdRows] = await Promise.all([
      supaQuery("daily_kpis", {
        select: "date,registrations",
        filters,
        order: "date.asc",
      }),
      supaQuery("ftd_daily", {
        select: "date,ftds",
        filters,
        order: "date.asc",
      }),
    ]);

    const registrations = kpiRows.map((r) => ({
      date:  String(r.date),
      value: Number(r.registrations ?? 0),
    }));

    const ftds = ftdRows.map((r) => ({
      date:  String(r.date),
      value: Number(r.ftds ?? 0),
    }));

    return res.status(200).json({ registrations, ftds });
  } catch (err) {
    console.error("[/api/timeseries/registrations]", err);
    return res.status(500).json({ error: String(err) });
  }
}
