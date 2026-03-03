/**
 * GET /api/transactions/kpis?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns transaction KPIs. The transactions_daily table is currently empty
 * (the parquet file had 0 rows), so this returns has_data: false which
 * causes the frontend to fall back to mock transaction data gracefully.
 *
 * When transactions_daily is populated in a future data refresh, this
 * endpoint will return real values automatically.
 *
 * Source: transactions_daily
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

    const rows = await supaQuery("transactions_daily", { filters });

    if (rows.length === 0) {
      return res.status(200).json({ has_data: false });
    }

    return res.status(200).json({
      has_data:              true,
      deposits:              sum(rows, "deposits"),
      withdrawals:           sum(rows, "withdrawals"),
      tx_count_pending:      sum(rows, "tx_count_pending"),
      tx_count_accepted:     sum(rows, "tx_count_accepted"),
      tx_count_other_status: sum(rows, "tx_count_other_status"),
    });
  } catch (err) {
    console.error("[/api/transactions/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
}
