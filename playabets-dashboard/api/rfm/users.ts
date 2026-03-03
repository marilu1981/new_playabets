/**
 * GET /api/rfm/users?segment=Champions&limit=100
 *
 * Returns RFM user data for the Users page.
 * Supports optional segment filter and limit.
 *
 * Shape: { users: Array<rfm_users row>, segment_counts: { [segment]: number } }
 *
 * Source: rfm_users
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
    const segment = req.query.segment ? String(req.query.segment) : null;
    const limit   = req.query.limit   ? Number(req.query.limit)   : 200;

    // Get segment counts (all users, no date filter — RFM is a snapshot)
    const allSegments = await supaQuery<{ segment: string }>("rfm_users", {
      select: "segment",
    });

    const segment_counts: Record<string, number> = {};
    for (const row of allSegments) {
      const seg = String(row.segment ?? "Unknown");
      segment_counts[seg] = (segment_counts[seg] ?? 0) + 1;
    }

    // Get filtered user rows
    const filters: string[] = [];
    if (segment) filters.push(`segment=eq.${segment}`);

    const users = await supaQuery("rfm_users", {
      select: "userid,userstatus,segment,recency_days,frequency_30d,monetary_30d,rfm_score,r_score,f_score,m_score,ggr_30d,sessions_30d,bets_30d",
      filters,
      order: "rfm_score.desc",
      limit,
    });

    return res.status(200).json({ users, segment_counts });
  } catch (err) {
    console.error("[/api/rfm/users]", err);
    return res.status(500).json({ error: String(err) });
  }
}
