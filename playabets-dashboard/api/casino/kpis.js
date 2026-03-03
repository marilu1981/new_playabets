const { supaQuery, sum, corsHeaders } = require("../_supabase");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  try {
    const start = String(req.query.start ?? "");
    const end   = String(req.query.end   ?? "");
    const filters = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end)   filters.push(`date=lte.${end}`);
    const rows = await supaQuery("casino_daily", { filters });
    const ggr = sum(rows, "ggr");
    return res.status(200).json({
      rounds:       sum(rows, "rounds"),
      actives:      sum(rows, "actives"),
      turnover:     sum(rows, "turnover"),
      winnings:     sum(rows, "winnings"),
      ggr,
      hold_pct:     rows.length > 0 ? (ggr / Math.max(sum(rows, "turnover"), 1)) * 100 : 0,
    });
  } catch (err) {
    console.error("[/api/casino/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
};
