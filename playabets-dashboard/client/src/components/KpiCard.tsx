/**
 * PLAYA BETS — KPI Card Component
 * Brand design: light card, Playa Green accent, Roboto Slab headings
 */

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  change?: number; // percentage change
  changeLabel?: string;
  icon?: React.ReactNode;
  accent?: "gold" | "green" | "red" | "teal" | "amber";
  className?: string;
  valueClassName?: string;
  formatter?: (v: number) => string;
  loading?: boolean;
}

const accentColors = {
  gold:  "#7ab800",   /* Playa Green — primary brand */
  green: "#093508",   /* Forest Leaf */
  red:   "#d94040",
  teal:  "#0d8f8f",
  amber: "#ffb500",   /* Sunny Yellow */
};

export default function KpiCard({
  title,
  value,
  subtitle,
  change,
  changeLabel,
  icon,
  accent = "gold",
  className,
  valueClassName,
  loading = false,
}: KpiCardProps) {
  const color = accentColors[accent];
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div
      className={cn("stat-card rounded-lg p-2.5 relative", className)}
      style={{
        background: "#f5f9f5",
        border: "1px solid #dde8dd",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {/* Top accent line — brand gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
        style={{ background: `linear-gradient(90deg, #7ab800, #093508)` }}
      />

      <div className="flex items-start justify-between gap-2 mt-1">
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 truncate">
            {title}
          </div>
          <div
            className={cn("text-sm font-bold text-gray-900 leading-tight break-all", valueClassName)}
          >
            {loading ? (
              <div className="h-4 w-16 rounded animate-pulse" style={{ background: "#dde8dd" }} />
            ) : value}
          </div>
          {subtitle && (
            <div className="text-[9px] text-gray-400 mt-1 truncate">
              {loading ? <div className="h-2.5 w-12 rounded animate-pulse" style={{ background: "#dde8dd" }} /> : subtitle}
            </div>
          )}
          {change !== undefined && (
            <div className={cn("flex items-center gap-1 mt-1 text-[9px] font-medium")}>
              {isPositive && <TrendingUp size={10} style={{ color: "#3d8c2e" }} />}
              {isNegative && <TrendingDown size={10} style={{ color: "#c03030" }} />}
              {!isPositive && !isNegative && <Minus size={10} className="text-gray-400" />}
              <span style={{ color: isPositive ? "#3d8c2e" : isNegative ? "#c03030" : "#999999" }}>
                {change > 0 ? "+" : ""}{change?.toFixed(1)}%
              </span>
              {changeLabel && <span className="text-gray-400">{changeLabel}</span>}
            </div>
          )}
        </div>

        {icon && (
          <div
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: `${color}18`, color }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
