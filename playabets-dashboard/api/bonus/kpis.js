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
    const rows = await supaQuery("bonus_daily", { filters });
    return res.status(200).json({
      bonus_issued:    sum(rows, "bonus_issued"),
      bonus_credited:  sum(rows, "bonus_credited"),
      bonus_cancelled: sum(rows, "bonus_cancelled"),
      players_bonused: sum(rows, "players_bonused"),
    });
  } catch (err) {
    console.error("[/api/bonus/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
};
