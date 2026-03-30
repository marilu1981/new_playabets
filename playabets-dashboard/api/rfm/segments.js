const { supaQuery, supaQueryAll, corsHeaders, requireAuth } = require("../_supabase");

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
    const end   = String(req.query.end   ?? "");
    const mode  = String(req.query.mode ?? "").toLowerCase();
    const filters = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end)   filters.push(`date=lte.${end}`);

    if (mode !== "snapshot") {
      try {
        const rows = await supaQuery("daily_kpis", {
          select: "date,rfm_champions,rfm_loyal,rfm_big_spenders,rfm_mid,rfm_at_risk,rfm_dormant",
          filters,
          order: "date.asc",
        });
        if (Array.isArray(rows) && rows.length > 0) {
          return res.status(200).json({ rows, source: "daily_kpis" });
        }
      } catch (err) {
        console.warn("[/api/rfm/segments] daily_kpis lookup failed, falling back to rfm_users");
      }
    }

    const segmentRows = await supaQueryAll("rfm_users", {
      select: "segment",
    });
    const counts = {};
    for (const row of segmentRows || []) {
      const key = String(row.segment ?? "Unknown").trim() || "Unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const date = end || start || new Date().toISOString().slice(0, 10);
    const snapshot = {
      date,
      rfm_champions: counts["Champions"] ?? 0,
      rfm_loyal: counts["Loyal"] ?? 0,
      rfm_big_spenders: counts["Big Spenders"] ?? 0,
      rfm_mid: counts["Mid"] ?? 0,
      rfm_at_risk: counts["At Risk"] ?? 0,
      rfm_dormant: counts["Dormant"] ?? 0,
    };
    return res.status(200).json({ rows: [snapshot], source: "rfm_users" });
  } catch (err) {
    console.error("[/api/rfm/segments]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
