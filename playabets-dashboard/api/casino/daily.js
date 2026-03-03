const { supaQuery, corsHeaders } = require("../_supabase");

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
    const rows = await supaQuery("casino_daily", { filters, order: "date.asc" });
    // Map casino_daily columns to the shape the frontend expects: { points: [{date, stake, winnings, ggr}] }
    const points = (rows || []).map(r => ({
      date: r.date,
      stake: r.casino_stake,
      winnings: r.casino_winnings,
      ggr: r.casino_ggr,
      actives: r.casino_actives,
      bets: r.casino_bets,
    }));
    return res.status(200).json({ points });
  } catch (err) {
    console.error("[/api/casino/daily]", err);
    return res.status(500).json({ error: String(err) });
  }
};
