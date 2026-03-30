'use strict';

const { supaQueryAll, corsHeaders, requireAuth } = require("../_supabase");

const CANDIDATE_TABLES = [
  process.env.PLAYABETS_BETSLIPS_TABLE,
  process.env.BETSLIPS_TABLE,
  "betslips_latest",
  "betslips",
].filter(Boolean);

const CANDIDATE_SHAPES = [
  { type: "BetslipType", typeId: "BetslipTypeID", date: "PlacementDate" },
  { type: "betsliptype", typeId: "betsliptypeid", date: "placementdate" },
  { type: "type", typeId: "typeid", date: "date" },
];

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

    for (const table of CANDIDATE_TABLES) {
      for (const shape of CANDIDATE_SHAPES) {
        try {
          const select = [shape.type, shape.typeId, shape.date].join(",");
          const filters = [];
          if (start) filters.push(`${shape.date}=gte.${start}`);
          if (end) filters.push(`${shape.date}=lte.${end}`);

          const rows = await supaQueryAll(table, { select, filters });
          const counts = new Map();

          for (const row of rows || []) {
            const rawType = row[shape.type];
            const type = String(rawType ?? "Unknown").trim() || "Unknown";
            const key = type;
            const prev = counts.get(key) ?? {
              type,
              typeId: row[shape.typeId] == null ? null : Number(row[shape.typeId]),
              count: 0,
            };
            prev.count += 1;
            counts.set(key, prev);
          }

          return res.status(200).json(
            Array.from(counts.values())
              .filter((row) => row.count > 0)
              .sort((a, b) => b.count - a.count)
          );
        } catch (err) {
          console.warn(`[/api/betting/betslips-by-type] ${table} ${shape.type}/${shape.date} lookup failed`, err);
        }
      }
    }

    return res.status(200).json([]);
  } catch (err) {
    console.error("[/api/betting/betslips-by-type]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
