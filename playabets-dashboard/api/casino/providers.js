const { supaQueryAll, corsHeaders } = require("../_supabase");

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
    const end = String(req.query.end ?? "");
    const filters = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end) filters.push(`date=lte.${end}`);

    let rows = [];
    try {
      rows = await supaQueryAll("casino_providers_daily", { filters });
    } catch (err) {
      console.warn("[/api/casino/providers] casino_providers_daily lookup failed", err);
      return res.status(200).json({ providers: [] });
    }

    const grouped = new Map();
    for (const row of rows || []) {
      const provider = String(row.provider_name ?? row.provider ?? "Unknown");
      const casinoType = String(row.casino_type ?? row.casinoType ?? "Casino");
      const key = `${provider}::${casinoType}`;
      const current = grouped.get(key) ?? {
        provider,
        casinoType,
        bets: 0,
        stake: 0,
        winnings: 0,
        profit: 0,
      };
      current.bets += Number(row.bets ?? 0);
      current.stake += Number(row.stake ?? 0);
      current.winnings += Number(row.winnings ?? 0);
      current.profit += Number(row.ggr ?? (Number(row.stake ?? 0) - Number(row.winnings ?? 0)));
      grouped.set(key, current);
    }

    const providers = Array.from(grouped.values()).sort((a, b) => b.profit - a.profit);
    return res.status(200).json({ providers });
  } catch (err) {
    console.error("[/api/casino/providers]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
