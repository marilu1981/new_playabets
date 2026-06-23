/**
 * PLAYA BETS — KPI Card Component
 * Brand design: light card, Playa Green accent, Roboto Slab headings
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  tooltip?: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  accent?: "gold" | "green" | "red" | "teal" | "amber";
  className?: string;
  valueClassName?: string;
  formatter?: (v: number) => string;
  loading?: boolean;
}

const accentColors = {
  gold:  "#7ab800",
  green: "#093508",
  red:   "#d94040",
  teal:  "#0d8f8f",
  amber: "#ffb500",
};

export default function KpiCard({
  title,
  value,
  subtitle,
  tooltip,
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
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={cn("stat-card rounded-lg p-2.5 relative", className)}
      style={{
        background: "#f5f9f5",
        border: "1px solid #dde8dd",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
        style={{ background: `linear-gradient(90deg, #7ab800, #093508)` }}
      />

      <div className="flex items-start justify-between gap-2 mt-1">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-1.5">
            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest truncate">
              {title}
            </div>
            {tooltip && (
              <div className="relative flex-shrink-0" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
                <HelpCircle size={10} className="text-gray-400 cursor-help" />
                {showTooltip && (
                  <div
                    className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 rounded-md shadow-lg text-[10px] leading-snug p-2"
                    style={{ background: "#1a2e1a", color: "#e8f5e8", border: "1px solid #2d4a2d" }}
                  >
                    {tooltip}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0"
                      style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "4px solid #1a2e1a" }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={cn("text-sm font-bold text-gray-900 leading-tight break-all", valueClassName)}>
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
