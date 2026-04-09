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
      className={cn("stat-card rounded-lg p-4 relative", className)}
      style={{
        background: "#ffffff",
        border: "1px solid #e4ece4",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
      }}
    >
      {/* Top accent line — brand gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg"
        style={{ background: `linear-gradient(90deg, #7ab800, #093508)`, opacity: 0.85 }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 truncate">
            {title}
          </div>
          <div
            className={cn("text-2xl font-bold text-gray-900 leading-none mb-1", valueClassName)}
          >
            {loading ? (
              <div className="h-7 w-24 rounded animate-pulse" style={{ background: "#e8ede8" }} />
            ) : value}
          </div>
          {subtitle && (
            <div className="text-xs text-gray-400 mt-1">
              {loading ? <div className="h-3 w-16 rounded animate-pulse" style={{ background: "#e8ede8" }} /> : subtitle}
            </div>
          )}
          {change !== undefined && (
            <div className={cn("flex items-center gap-1 mt-2 text-xs font-medium")}>
              {isPositive && <TrendingUp size={12} style={{ color: "#3d8c2e" }} />}
              {isNegative && <TrendingDown size={12} style={{ color: "#c03030" }} />}
              {!isPositive && !isNegative && <Minus size={12} className="text-gray-400" />}
              <span
                style={{
                  color: isPositive ? "#3d8c2e" : isNegative ? "#c03030" : "#999999",
                }}
              >
                {change > 0 ? "+" : ""}{change?.toFixed(1)}%
              </span>
              {changeLabel && (
                <span className="text-gray-400">{changeLabel}</span>
              )}
            </div>
          )}
        </div>

        {icon && (
          <div
            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: `${color}18`, color }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
