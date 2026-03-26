'use strict';
const { supaQuery, sum, corsHeaders, cacheGet, cacheSet } = require("./_supabase");

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
    const cacheKey = `kpis:${req.url ?? JSON.stringify(req.query ?? {})}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const start = String(req.query.start ?? "");
    const end   = String(req.query.end   ?? "");
    const dateFilters = () => {
      const f = [];
      if (start) f.push(`date=gte.${start}`);
      if (end)   f.push(`date=lte.${end}`);
      return f;
    };

    // Fetch sportsbook KPIs, FTDs, bonus, and casino in parallel
    const [kpiRows, ftdRows, bonusRows, casinoRows, txRows] = await Promise.all([
      supaQuery("daily_kpis",  { filters: dateFilters() }),
      supaQuery("ftd_daily",   { filters: dateFilters() }),
      supaQuery("bonus_daily", { filters: dateFilters() }),
      supaQuery("casino_daily", { filters: dateFilters() }),
      TRANSACTIONS_ENABLED
        ? supaQuery("transactions_daily", { filters: dateFilters() }).catch((err) => {
            console.warn("[/api/kpis] transactions_daily lookup failed", err);
            return [];
          })
        : Promise.resolve([]),
    ]);

    // Sportsbook metrics
    const sportsbook_turnover = sum(kpiRows, "settled_stake");
    const sportsbook_ggr      = sum(kpiRows, "ggr");

    // Casino metrics — casino_stake and casino_ggr are the column names in casino_daily
    const casino_turnover = sum(casinoRows, "casino_stake");
    const casino_ggr      = sum(casinoRows, "casino_ggr");

    // Combined totals — mirrors backend/app.py lines 184-188
    const total_turnover = sportsbook_turnover + casino_turnover;
    const total_ggr      = sportsbook_ggr + casino_ggr;
    const bonusSpent     = sum(bonusRows, "bonus_credited");

    const payload = {
      registrations: sum(kpiRows, "registrations"),
      actives_sports: sum(kpiRows, "actives_sports"),
      actives_casino: sum(casinoRows, "casino_actives"),
      turnover:      total_turnover,
      winnings:      sum(kpiRows, "settled_winnings") + sum(casinoRows, "casino_winnings"),
      ggr:           total_ggr,
      ngr:           total_ggr - bonusSpent,
      bonus_spent:   bonusSpent,
      ftds:          sum(ftdRows, "ftds"),
      deposits:      sum(txRows, "total_deposits"),
      withdrawals:   sum(txRows, "total_withdrawals"),
      has_transactions_data: TRANSACTIONS_ENABLED && Array.isArray(txRows) && txRows.length > 0,
      transactions_enabled: TRANSACTIONS_ENABLED,
      tx_count_pending: sum(txRows, "tx_count_pending"),
      tx_count_accepted: sum(txRows, "tx_count_accepted"),
      tx_count_other_status: sum(txRows, "tx_count_other_status"),
    };
    cacheSet(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error("[/api/kpis]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
