/**
 * PLAYA BETS — Report Download Button
 * Collects current dashboard data and triggers PDF generation.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { generateReport, type ReportData } from "@/lib/generateReport";

interface ReportButtonProps {
  data: ReportData;
}

export default function ReportButton({ data }: ReportButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      // Small delay so the spinner renders before the synchronous PDF build blocks the thread
      await new Promise((r) => setTimeout(r, 80));
      generateReport(data);
    } finally {
      setLoading(false);
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
      title="Download executive PDF report"
    >
      {loading
        ? <Loader2 size={13} className="animate-spin" />
        : <Download size={13} />}
      <span>{loading ? "Building…" : "Download Report"}</span>
    </button>
  );
}
