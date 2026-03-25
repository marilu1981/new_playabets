'use strict';

const { supaQuery, corsHeaders } = require("../_supabase");

const CANDIDATE_TABLES = [
  process.env.PLAYABETS_BONUS_CAMPAIGNS_TABLE,
  process.env.BONUS_CAMPAIGNS_TABLE,
  "campaigns_latest",
  "bonus_campaigns",
  "campaigns",
].filter(Boolean);

function getField(row, candidates) {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return null;
}

function normalizeStatus(row) {
  const status = getField(row, ["CampaignStatus", "campaignstatus", "status"]);
  if (status) return String(status);

  const statusId = Number(getField(row, ["CampaignStatusID", "campaignstatusid", "statusid"]) ?? NaN);
  if (Number.isFinite(statusId)) {
    if (statusId === 1) return "Active";
    if (statusId === 2) return "Finished";
  }
  return "Unknown";
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    const h = corsHeaders(req);
    Object.entries(h).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  try {
    const statusFilter = String(req.query.status ?? "").trim().toLowerCase();
    let rows = [];
    let source = null;

    for (const table of CANDIDATE_TABLES) {
      try {
        const result = await supaQuery(table, {
          select: "*",
          limit: 1000,
        });
        if (Array.isArray(result) && result.length > 0) {
          rows = result;
          source = table;
          break;
        }
      } catch (err) {
        console.warn(`[/api/bonus/campaigns] ${table} lookup failed`, err);
      }
    }

    const campaigns = rows
      .map((row) => {
        const campaignId = Number(getField(row, ["CampaignID", "campaignid", "id"]) ?? 0);
        const status = normalizeStatus(row);
        return {
          campaignId,
          name: String(getField(row, ["Name", "name", "Code", "code"]) ?? `Campaign ${campaignId || "Unknown"}`),
          status,
          bonusType: String(getField(row, ["BonusType", "bonustype", "type"]) ?? "Unknown"),
          startDate: String(getField(row, ["ValidityStartDate", "validitystartdate", "InsertDate", "insertdate"]) ?? ""),
          endDate: String(getField(row, ["ValidityEndDate", "validityenddate"]) ?? ""),
          usersEnrolled: null,
          totalPaid: null,
          roi: null,
        };
      })
      .filter((row) => row.campaignId > 0 || row.name !== "Campaign Unknown")
      .filter((row) => !statusFilter || row.status.toLowerCase() === statusFilter);

    return res.status(200).json({ campaigns, source });
  } catch (err) {
    console.error("[/api/bonus/campaigns]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
