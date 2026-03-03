/**
 * GET /api/bonus/kpis?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns aggregated bonus KPIs for the Bonus page.
 *
 * Shape: {
 *   total_bonus_credited, total_bonus_count, unique_bonus_users,
 *   ftd_bonus_count, ftd_bonus_users, ftd_bonus_amount
 * }
 *
 * Source: bonus_daily
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

    const rows = await supaQuery("bonus_daily", { filters });

    return res.status(200).json({
      total_bonus_credited: sum(rows, "bonus_credited"),
      total_bonus_count:    sum(rows, "bonus_count"),
      unique_bonus_users:   sum(rows, "unique_bonus_users"),
      ftd_bonus_count:      sum(rows, "first_deposit_bonus_count"),
      ftd_bonus_users:      sum(rows, "first_deposit_bonus_users"),
      ftd_bonus_amount:     sum(rows, "first_deposit_bonus_amount"),
    });
  } catch (err) {
    console.error("[/api/bonus/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
}
