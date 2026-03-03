/**
 * GET /api/kpis?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns aggregated KPIs for the Home page overview cards:
 *   registrations, actives, turnover, winnings, ggr, ngr,
 *   deposits, withdrawals, bonus_spent, ftds
 *
 * Sources: daily_kpis + ftd_daily + bonus_daily
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supaQuery, sum, corsHeaders } from "./_supabase";

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

    const dateFilters = (col = "date") => {
      const f: string[] = [];
      if (start) f.push(`${col}=gte.${start}`);
      if (end)   f.push(`${col}=lte.${end}`);
      return f;
    };

    const [kpiRows, ftdRows, bonusRows] = await Promise.all([
      supaQuery("daily_kpis", { filters: dateFilters() }),
      supaQuery("ftd_daily",  { filters: dateFilters() }),
      supaQuery("bonus_daily", { filters: dateFilters() }),
    ]);

    const registrations = sum(kpiRows, "registrations");
    const actives       = sum(kpiRows, "actives_sports");
    const settledStake  = sum(kpiRows, "settled_stake");
    const settledWins   = sum(kpiRows, "settled_winnings");
    const ggr           = sum(kpiRows, "ggr");
    const ftds          = sum(ftdRows,  "ftds");
    const bonusSpent    = sum(bonusRows, "bonus_credited");
    const ngr           = ggr - bonusSpent;

    return res.status(200).json({
      registrations,
      actives,
      turnover:     settledStake,
      winnings:     settledWins,
      ggr,
      ngr,
      bonus_spent:  bonusSpent,
      ftds,
      // transactions not in parquet data — return null so frontend falls back gracefully
      deposits:     null,
      withdrawals:  null,
    });
  } catch (err) {
    console.error("[/api/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
}
