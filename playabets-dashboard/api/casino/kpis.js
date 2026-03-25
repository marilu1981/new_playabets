const { supaQuery, sum, corsHeaders } = require("../_supabase");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    const h = corsHeaders(req);
    Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  try {
    const start = String(req.query.start ?? "");
    const end   = String(req.query.end   ?? "");
    const filters = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end)   filters.push(`date=lte.${end}`);
    const rows = await supaQuery("casino_daily", { filters });
    const stake = sum(rows, "casino_stake");
    const winnings = sum(rows, "casino_winnings");
    const ggr = sum(rows, "casino_ggr");
    const bets = sum(rows, "casino_bets");
    const actives = sum(rows, "casino_actives");
    return res.status(200).json({
      stake,
      turnover:     stake,
      winnings,
      ggr,
      bets,
      actives,
      hold_pct:     rows.length > 0 ? (ggr / Math.max(stake, 1)) * 100 : 0,
    });
  } catch (err) {
    console.error("[/api/casino/kpis]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
