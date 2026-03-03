/**
 * GET /api/bonus/daily?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns daily bonus rows for NGR calculation and bonus trend charts.
 * Shape: { points: Array<{ date, bonus_credited, bonus_count, unique_bonus_users }> }
 *
 * Source: bonus_daily
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

    const rows = await supaQuery("bonus_daily", {
      select: "date,bonus_credited,bonus_count,unique_bonus_users,first_deposit_bonus_count,first_deposit_bonus_users,first_deposit_bonus_amount",
      filters,
      order: "date.asc",
    });

    const points = rows.map((r) => ({
      date:                        String(r.date),
      bonus_credited:              Number(r.bonus_credited              ?? 0),
      bonus_count:                 Number(r.bonus_count                 ?? 0),
      unique_bonus_users:          Number(r.unique_bonus_users          ?? 0),
      first_deposit_bonus_count:   Number(r.first_deposit_bonus_count   ?? 0),
      first_deposit_bonus_users:   Number(r.first_deposit_bonus_users   ?? 0),
      first_deposit_bonus_amount:  Number(r.first_deposit_bonus_amount  ?? 0),
    }));

    return res.status(200).json({ points });
  } catch (err) {
    console.error("[/api/bonus/daily]", err);
    return res.status(500).json({ error: String(err) });
  }
}
