/**
 * PLAYA BETS — Report Download Button
 * Fetches AI insights from Azure OpenAI then generates the PDF.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { generateReport, type ReportData, type AiInsights } from "@/lib/generateReport";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/+$/, "");
const API_KEY = (import.meta.env.VITE_API_KEY as string | undefined) ?? "";

interface ReportButtonProps {
  data: ReportData;
}

async function fetchAiInsights(data: ReportData): Promise<AiInsights | null> {
  try {
    const ggr = data.ggr ?? (data.totalStake - data.totalWinnings);
    const params = new URLSearchParams({
      start: data.dateFrom,
      end:   data.dateTo,
      registrations:   String(data.registrations),
      ftds:            String(data.ftds),
      conv_rate:       String(data.registrations > 0 ? ((data.ftds / data.registrations) * 100).toFixed(1) : 0),
      ggr:             String(Math.round(ggr)),
      ngr:             String(Math.round(data.ngr ?? 0)),
      turnover:        String(Math.round(data.totalStake)),
      hold_pct:        String(data.holdPct ?? 0),
      deposits:        String(Math.round(data.totalDeposits)),
      withdrawals:     String(Math.round(data.totalWithdrawals)),
      net_cash:        String(Math.round(data.totalDeposits - data.totalWithdrawals)),
      churn_pct:       String(data.churnPct ?? 0),
      retention_d7:    String(data.retentionD7 ?? 0),
      retention_d30:   String(data.retentionD30 ?? 0),
      active_players:  String(data.activePlayersSports + data.activePlayersCasino),
      avg_ftd_value:   String(Math.round(data.avgFtdValue ?? 0)),
      total_vips:      String(data.totalVips ?? 0),
      vip_ggr:         String(Math.round(data.vipGgr ?? 0)),
      bonus_issued:    String(Math.round(data.bonusesCredited)),
      bonus_converted: String(0),
    });

    const res = await fetch(`${API_BASE_URL}/insights/ai-summary?${params}`, {
      method: "POST",
      headers: { "Accept": "application/json", ...(API_KEY ? { "X-API-Key": API_KEY } : {}) },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.available) return null;
    return json as AiInsights;
  } catch {
    return null;
  }
}

export default function ReportButton({ data }: ReportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState<string>("");

  const handleClick = async () => {
    setLoading(true);
    setStatus("Fetching AI insights…");
    try {
      const aiInsights = await fetchAiInsights(data);
      setStatus("Building PDF…");
      await new Promise((r) => setTimeout(r, 80));
      generateReport({ ...data, aiInsights });
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "oklch(0.72 0.14 85 / 15%)",
        color: "oklch(0.72 0.14 85)",
        border: "1px solid oklch(0.72 0.14 85 / 30%)",
      }}
      title="Download executive PDF report with AI insights"
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      <span>{loading ? (status || "Building…") : "Download Report"}</span>
    </button>
  );
}
