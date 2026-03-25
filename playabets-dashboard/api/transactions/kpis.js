const { supaQuery, sum, corsHeaders, cacheGet, cacheSet } = require("../_supabase");

const TRANSACTIONS_ENABLED = process.env.PLAYABETS_ENABLE_TRANSACTIONS === "1";

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    const h = corsHeaders(req);
    Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  try {
    const cacheKey = `transactions-kpis:${req.url ?? JSON.stringify(req.query ?? {})}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    if (!TRANSACTIONS_ENABLED) {
      const payload = {
        has_data: false,
        disabled: true,
        message: "Transactions are temporarily disabled while the source export is unavailable.",
        deposits: 0,
        withdrawals: 0,
        net: 0,
        tx_count_pending: 0,
        tx_count_accepted: 0,
        tx_count_other_status: 0,
      };
      cacheSet(cacheKey, payload);
      return res.status(200).json(payload);
    }

    const start = String(req.query.start ?? "");
    const end = String(req.query.end ?? "");
    const filters = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end) filters.push(`date=lte.${end}`);

    const rows = await supaQuery("transactions_daily", { filters }).catch((err) => {
      console.warn("[/api/transactions/kpis] transactions_daily lookup failed", err);
      return [];
    });

    const payload = {
      has_data: Array.isArray(rows) && rows.length > 0,
      disabled: false,
      deposits: sum(rows, "total_deposits"),
      withdrawals: sum(rows, "total_withdrawals"),
      net: sum(rows, "total_deposits") - sum(rows, "total_withdrawals"),
      tx_count_pending: sum(rows, "tx_count_pending"),
      tx_count_accepted: sum(rows, "tx_count_accepted"),
      tx_count_other_status: sum(rows, "tx_count_other_status"),
    };
    cacheSet(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error("[/api/transactions/kpis]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
