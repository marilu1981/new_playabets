const { supaQuery, sum, corsHeaders } = require("../_supabase");

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
    const end   = String(req.query.end   ?? "");
    const filters = [];
    if (start) filters.push(`date=gte.${start}`);
    if (end)   filters.push(`date=lte.${end}`);
    const rows = await supaQuery("bonus_daily", { filters });
    const dailyBonusPerUser = rows
      .map((row) => {
        const credited = Number(row.bonus_credited ?? 0);
        const users = Number(row.unique_bonus_users ?? 0);
        return users > 0 ? credited / users : 0;
      });
    const averageDailyBonusPerUser =
      dailyBonusPerUser.length > 0
        ? dailyBonusPerUser.reduce((acc, value) => acc + value, 0) / dailyBonusPerUser.length
        : 0;
    const averageDailyUniqueBonusUsers =
      rows.length > 0
        ? rows.reduce((acc, row) => acc + Number(row.unique_bonus_users ?? 0), 0) / rows.length
        : 0;
    return res.status(200).json({
      total_bonuses_credited: sum(rows, "bonus_credited"),
      average_daily_bonus_per_user: averageDailyBonusPerUser,
      est_total_bonuses_per_user: dailyBonusPerUser.reduce((acc, value) => acc + value, 0),
      average_daily_unique_bonus_users: averageDailyUniqueBonusUsers,
      bonuses_paid_total_count: sum(rows, "bonus_count"),
      first_deposit_bonus_amount_total: sum(rows, "first_deposit_bonus_amount"),
    });
  } catch (err) {
    console.error("[/api/bonus/kpis]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
