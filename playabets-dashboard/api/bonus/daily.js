const { supaQuery, corsHeaders } = require("../_supabase");

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
    const rows = await supaQuery("bonus_daily", { filters, order: "date.asc" });
    // Return { points: [...] } to match the original FastAPI response shape
    return res.status(200).json({ points: rows || [] });
  } catch (err) {
    console.error("[/api/bonus/daily]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
