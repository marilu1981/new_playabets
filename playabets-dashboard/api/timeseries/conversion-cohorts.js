const { supaQuery, corsHeaders, requireAuth } = require("../_supabase");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    const h = corsHeaders(req);
    Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  if (requireAuth(req, res)) return;

  try {
    const start = String(req.query.start ?? "");
    const end = String(req.query.end ?? "");
    const filters = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end) filters.push(`date=lte.${end}`);

    const rows = await supaQuery("conversion_cohorts_daily", {
      select: "date,registrations,ftds_d7,ftds_d30,rate_d7,rate_d30",
      filters,
      order: "date.asc",
    });

    return res.status(200).json({ rows });
  } catch (err) {
    console.error("[/api/timeseries/conversion-cohorts]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
