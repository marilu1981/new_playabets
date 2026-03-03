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

    // Merge by date
    const ftdMap = {};
    for (const r of ftdRows) ftdMap[r.date] = r.ftds;

    const merged = kpiRows.map(r => ({
      date:          r.date,
      registrations: r.registrations,
      ftds:          ftdMap[r.date] ?? 0,
    }));
    return res.status(200).json(merged);
  } catch (err) {
    console.error("[/api/timeseries/registrations]", err);
    return res.status(500).json({ error: String(err) });
  }
};
