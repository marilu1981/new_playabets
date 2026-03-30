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
    const segment = String(req.query.segment ?? "");
    const limit   = Math.min(parseInt(String(req.query.limit ?? "500"), 10), 2000);
    const filters = [];
    if (segment) filters.push(`segment=eq.${segment}`);
    const rows = await supaQuery("rfm_users", {
      select: "userid,segment,recency_days,frequency_30d,frequency_basis,monetary_30d,rfm_score",
      filters,
      order: "rfm_score.desc",
      limit,
    });
    const users = (rows || []).map((row) => ({
      userid: row.userid,
      segment: row.segment ?? "Unknown",
      recency_days: Number(row.recency_days ?? 0),
      frequency_30d: Number(row.frequency_30d ?? 0),
      frequency_basis: row.frequency_basis ?? null,
      monetary_30d: Number(row.monetary_30d ?? 0),
      rfm_score: Number(row.rfm_score ?? 0),
      // Back-compat aliases for any older consumers.
      rfm_segment: row.segment ?? "Unknown",
      frequency: Number(row.frequency_30d ?? 0),
      monetary: Number(row.monetary_30d ?? 0),
    }));
    return res.status(200).json({ users });
  } catch (err) {
    console.error("[/api/rfm/users]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
