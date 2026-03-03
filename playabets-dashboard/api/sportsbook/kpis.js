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
    const rows = await supaQuery("daily_kpis", { filters });
    const settledStake = sum(rows, "settled_stake");
    const ggr = sum(rows, "ggr");
    return res.status(200).json({
      betslips:      sum(rows, "betslips_count"),
      actives:       sum(rows, "actives_sports"),
      placed_stake:  sum(rows, "placed_stake"),
      settled_stake: settledStake,
      winnings:      sum(rows, "settled_winnings"),
      ggr,
      hold_pct:      settledStake > 0 ? (ggr / settledStake) * 100 : 0,
      win_rate:      rows.length > 0 ? sum(rows, "win_rate") / rows.length : 0,
      cancel_rate:   rows.length > 0 ? sum(rows, "cancel_rate") / rows.length : 0,
    });
  } catch (err) {
    console.error("[/api/sportsbook/kpis]", err);
    return res.status(500).json({ error: String(err) });
  }
};
