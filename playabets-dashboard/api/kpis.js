'use strict';
const { supaQuery, sum, corsHeaders } = require("./_supabase");

module.exports = async function handler(req, res) {
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
    const dateFilters = () => {
      const f = [];
      if (start) f.push(`date=gte.${start}`);
      if (end)   f.push(`date=lte.${end}`);
      return f;
    };

    // Fetch sportsbook KPIs, FTDs, bonus, and casino in parallel
    const [kpiRows, ftdRows, bonusRows, casinoRows] = await Promise.all([
      supaQuery("daily_kpis",  { filters: dateFilters() }),
      supaQuery("ftd_daily",   { filters: dateFilters() }),
      supaQuery("bonus_daily", { filters: dateFilters() }),
      supaQuery("casino_daily", { filters: dateFilters() }),
    ]);

    // Sportsbook metrics
    const sportsbook_turnover = sum(kpiRows, "settled_stake");
    const sportsbook_ggr      = sum(kpiRows, "ggr");

    // Casino metrics — casino_stake and casino_ggr are the column names in casino_daily
    const casino_turnover = sum(casinoRows, "casino_stake");
    const casino_ggr      = sum(casinoRows, "casino_ggr");

    // Combined totals — mirrors backend/app.py lines 184-188
    const total_turnover = sportsbook_turnover + casino_turnover;
    const total_ggr      = sportsbook_ggr + casino_ggr;
    const bonusSpent     = sum(bonusRows, "bonus_credited");

    return res.status(200).json({
      registrations: sum(kpiRows, "registrations"),
      // Actives = Sports actives + Casino actives (Sports + Casino combined)
      actives:       sum(kpiRows, "actives_sports") + sum(casinoRows, "casino_actives"),
      turnover:      total_turnover,
      winnings:      sum(kpiRows, "settled_winnings") + sum(casinoRows, "casino_winnings"),
      ggr:           total_ggr,
      ngr:           total_ggr - bonusSpent,
      bonus_spent:   bonusSpent,
      ftds:          sum(ftdRows, "ftds"),
      deposits:      null,
      withdrawals:   null,
    });
  } catch (err) {
    console.error("[/api/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
};
