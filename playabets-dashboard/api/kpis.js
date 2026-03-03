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
    const dateFilters = (col = "date") => {
      const f = [];
      if (start) f.push(`${col}=gte.${start}`);
      if (end)   f.push(`${col}=lte.${end}`);
      return f;
    };
    const [kpiRows, ftdRows, bonusRows] = await Promise.all([
      supaQuery("daily_kpis",  { filters: dateFilters() }),
      supaQuery("ftd_daily",   { filters: dateFilters() }),
      supaQuery("bonus_daily", { filters: dateFilters() }),
    ]);
    const ggr       = sum(kpiRows, "ggr");
    const bonusSpent = sum(bonusRows, "bonus_credited");
    return res.status(200).json({
      registrations: sum(kpiRows, "registrations"),
      actives:       sum(kpiRows, "actives_sports"),
      turnover:      sum(kpiRows, "settled_stake"),
      winnings:      sum(kpiRows, "settled_winnings"),
      ggr,
      ngr:           ggr - bonusSpent,
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
