'use strict';
/**
 * GET /api/users/status-breakdown
 * Returns user counts grouped by userstatus from the latest users export.
 * Source table: rfm_users (contains userstatus column from view_Users export)
 *
 * Response shape (matches FastAPI /users/status-breakdown):
 * { statuses: [{ status: string, count: number }] }
 */
const { supaQueryAll, corsHeaders } = require("../_supabase");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    return res.status(200).end();
  }
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  try {
    // rfm_users has a userstatus column from the view_Users export.
    // supaQueryAll paginates past the 1000-row Supabase REST default so the
    // counts reflect all users, not just the first page.
    const rows = await supaQueryAll("rfm_users", {
      select: "userstatus",
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(200).json({ statuses: [] });
    }

    // Aggregate counts client-side (Supabase REST doesn't support GROUP BY directly)
    const counts = {};
    for (const row of rows) {
      const status = String(row.userstatus ?? "Unknown").trim() || "Unknown";
      counts[status] = (counts[status] ?? 0) + 1;
    }

    // Map to the expected shape and sort by count descending
    const statuses = Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    return res.status(200).json({ statuses });
  } catch (err) {
    console.error("[/api/users/status-breakdown]", err);
    return res.status(500).json({ error: String(err) });
  }
};
