const { corsHeaders } = require("../_supabase");

// transactions_daily parquet was empty — return null so frontend falls back to mock
module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end();
  }
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  return res.status(200).json({ deposits: null, withdrawals: null, net: null });
};
