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
    const kpiFilters = [];
    const ftdFilters = [];
    if (start) { kpiFilters.push(`date=gte.${start}`); ftdFilters.push(`date=gte.${start}`); }
    if (end)   { kpiFilters.push(`date=lte.${end}`);   ftdFilters.push(`date=lte.${end}`); }

    const [kpiRows, ftdRows] = await Promise.all([
      supaQuery("daily_kpis", { select: "date,registrations", filters: kpiFilters, order: "date.asc" }),
      supaQuery("ftd_daily",  { select: "date,ftds",          filters: ftdFilters, order: "date.asc" }),
    ]);

    // Return { registrations: [{date, registrations}], ftds: [{date, value}] }
    // to match the original FastAPI response shape the frontend expects
    return res.status(200).json({
      registrations: kpiRows,
      ftds: ftdRows.map(r => ({ date: r.date, value: r.ftds })),
    });
  } catch (err) {
    console.error("[/api/timeseries/registrations]", err);
    return res.status(500).json({ error: String(err) });
  }
};
