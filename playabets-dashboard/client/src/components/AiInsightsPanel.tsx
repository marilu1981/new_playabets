/**
 * PLAYA BETS — AI Insights Panel
 * 3-section display: Wins, Alerts, Watch List. No Recommendations.
 */
import type { AiInsights } from "@/lib/generateReport";

interface Props {
  insights: AiInsights | null;
  loading: boolean;
  title?: string;
  className?: string;
}

const QUADRANTS = [
  { key: "wins",       label: "Wins",       bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", dot: "#16a34a" },
  { key: "alerts",     label: "Alerts",     bg: "#fef2f2", border: "#fecaca", text: "#991b1b", dot: "#dc2626" },
  { key: "watch_list", label: "Watch List", bg: "#fffbeb", border: "#fde68a", text: "#92400e", dot: "#d97706" },
];

export default function AiInsightsPanel({ insights, loading, title = "Insights", className = "" }: Props) {
  if (!loading && !insights) return null;

  return (
    <div
      className={`rounded-xl p-5 mb-4 ${className}`}
      style={{ background: "#ffffff", border: "1px solid #e4ece4", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {loading && (
          <div
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: "#7ab800", borderTopColor: "transparent" }}
          />
        )}
      </div>

      {insights && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {QUADRANTS.map(({ key, label, bg, border, text, dot }) => {
            const items = (insights as unknown as Record<string, unknown>)[key] as string[] | undefined;
            if (!items?.length) return null;
            return (
              <div key={key} className="rounded-lg p-3.5" style={{ background: bg, border: `1px solid ${border}` }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: text }}>
                  {label}
                </div>
                <ul className="space-y-1.5">
                  {items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-snug" style={{ color: text }}>
                      <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
