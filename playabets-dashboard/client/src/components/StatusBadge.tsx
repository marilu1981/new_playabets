/**
 * PLAYA BETS — Status Badge Component
 * Pill badges for user statuses, betslip statuses, campaign statuses
 */

import { cn } from "@/lib/utils";

type StatusType =
  | "enabled" | "active" | "success" | "paid" | "live"
  | "disabled" | "error" | "refused" | "losing"
  | "pending" | "warning" | "in_progress" | "processing"
  | "frozen" | "info" | "teal"
  | "deleted" | "cancelled" | "expired"
  | "neutral" | "finished" | "closed";

const statusConfig: Record<StatusType, { label?: string; bg: string; color: string; border: string }> = {
  enabled:     { bg: "oklch(0.62 0.17 145 / 15%)", color: "oklch(0.75 0.17 145)", border: "oklch(0.62 0.17 145 / 25%)" },
  active:      { bg: "oklch(0.62 0.17 145 / 15%)", color: "oklch(0.75 0.17 145)", border: "oklch(0.62 0.17 145 / 25%)" },
  success:     { bg: "oklch(0.62 0.17 145 / 15%)", color: "oklch(0.75 0.17 145)", border: "oklch(0.62 0.17 145 / 25%)" },
  paid:        { bg: "oklch(0.62 0.17 145 / 15%)", color: "oklch(0.75 0.17 145)", border: "oklch(0.62 0.17 145 / 25%)" },
  live:        { bg: "oklch(0.62 0.17 145 / 15%)", color: "oklch(0.75 0.17 145)", border: "oklch(0.62 0.17 145 / 25%)" },
  disabled:    { bg: "oklch(0.55 0.22 25 / 15%)",  color: "oklch(0.70 0.18 25)",  border: "oklch(0.55 0.22 25 / 25%)" },
  error:       { bg: "oklch(0.55 0.22 25 / 15%)",  color: "oklch(0.70 0.18 25)",  border: "oklch(0.55 0.22 25 / 25%)" },
  refused:     { bg: "oklch(0.55 0.22 25 / 15%)",  color: "oklch(0.70 0.18 25)",  border: "oklch(0.55 0.22 25 / 25%)" },
  losing:      { bg: "oklch(0.55 0.22 25 / 15%)",  color: "oklch(0.70 0.18 25)",  border: "oklch(0.55 0.22 25 / 25%)" },
  pending:     { bg: "oklch(0.72 0.17 60 / 15%)",  color: "oklch(0.80 0.14 60)",  border: "oklch(0.72 0.17 60 / 25%)" },
  warning:     { bg: "oklch(0.72 0.17 60 / 15%)",  color: "oklch(0.80 0.14 60)",  border: "oklch(0.72 0.17 60 / 25%)" },
  in_progress: { bg: "oklch(0.72 0.14 85 / 15%)",  color: "oklch(0.82 0.12 85)",  border: "oklch(0.72 0.14 85 / 25%)" },
  processing:  { bg: "oklch(0.72 0.14 85 / 15%)",  color: "oklch(0.82 0.12 85)",  border: "oklch(0.72 0.14 85 / 25%)" },
  frozen:      { bg: "oklch(0.65 0.15 195 / 15%)", color: "oklch(0.75 0.12 195)", border: "oklch(0.65 0.15 195 / 25%)" },
  info:        { bg: "oklch(0.65 0.15 195 / 15%)", color: "oklch(0.75 0.12 195)", border: "oklch(0.65 0.15 195 / 25%)" },
  teal:        { bg: "oklch(0.65 0.15 195 / 15%)", color: "oklch(0.75 0.12 195)", border: "oklch(0.65 0.15 195 / 25%)" },
  deleted:     { bg: "oklch(0.30 0.02 0 / 40%)",   color: "oklch(0.55 0.02 0)",   border: "oklch(0.40 0.02 0 / 30%)" },
  cancelled:   { bg: "oklch(0.30 0.02 0 / 40%)",   color: "oklch(0.55 0.02 0)",   border: "oklch(0.40 0.02 0 / 30%)" },
  expired:     { bg: "oklch(0.30 0.02 0 / 40%)",   color: "oklch(0.55 0.02 0)",   border: "oklch(0.40 0.02 0 / 30%)" },
  neutral:     { bg: "oklch(0.30 0.02 0 / 40%)",   color: "oklch(0.55 0.02 0)",   border: "oklch(0.40 0.02 0 / 30%)" },
  finished:    { bg: "oklch(0.30 0.02 0 / 40%)",   color: "oklch(0.55 0.02 0)",   border: "oklch(0.40 0.02 0 / 30%)" },
  closed:      { bg: "oklch(0.30 0.02 0 / 40%)",   color: "oklch(0.55 0.02 0)",   border: "oklch(0.40 0.02 0 / 30%)" },
};

function getStatusType(status: string): StatusType {
  const s = status.toLowerCase().replace(/[\s-]/g, "_");
  if (s.includes("enabl") || s.includes("activ") || s.includes("paid") || s.includes("success") || s.includes("live")) return "enabled";
  if (s.includes("disabl") || s.includes("error") || s.includes("refus") || s.includes("los")) return "disabled";
  if (s.includes("pend") || s.includes("warn")) return "pending";
  if (s.includes("progress") || s.includes("process")) return "in_progress";
  if (s.includes("froz") || s.includes("teal") || s.includes("info")) return "frozen";
  if (s.includes("delet") || s.includes("cancel") || s.includes("expir") || s.includes("finish") || s.includes("close")) return "deleted";
  return "neutral";
}

interface StatusBadgeProps {
  status: string;
  type?: StatusType;
  className?: string;
  dot?: boolean;
}

export default function StatusBadge({ status, type, className, dot = false }: StatusBadgeProps) {
  const resolvedType = type || getStatusType(status);
  const config = statusConfig[resolvedType] || statusConfig.neutral;

  return (
    <span
      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", className)}
      style={{
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
      }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: config.color }}
        />
      )}
      {status}
    </span>
  );
}
