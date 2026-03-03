const { supaQuery, corsHeaders } = require("../_supabase");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  try {
    const rows = await supaQuery("daily_kpis", {
      select: "date",
      order: "date.desc",
      limit: 1,
    });
    const latest = rows[0]?.date ?? null;
    return res.status(200).json({ date: latest });
  } catch (err) {
    console.error("[/api/kpis/latest]", err);
    return res.status(500).json({ error: String(err) });
  }
};
