const { supaQuery, corsHeaders } = require("../_supabase");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  try {
    const segment = String(req.query.segment ?? "");
    const limit   = Math.min(parseInt(String(req.query.limit ?? "500"), 10), 2000);
    const filters = [];
    if (segment) filters.push(`rfm_segment=eq.${segment}`);
    const rows = await supaQuery("rfm_users", {
      select: "userid,rfm_segment,recency_days,frequency,monetary,rfm_score",
      filters,
      order: "monetary.desc",
      limit,
    });
    return res.status(200).json(rows);
  } catch (err) {
    console.error("[/api/rfm/users]", err);
    return res.status(500).json({ error: String(err) });
  }
};
