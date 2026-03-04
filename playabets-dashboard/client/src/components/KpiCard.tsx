/**
 * PLAYA BETS — KPI Card Component
 * * Savanna Gold design: dark card with gold top accent, DM Sans throughout
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
  gold: "oklch(0.72 0.14 85)",
  green: "oklch(0.62 0.17 145)",
  red: "oklch(0.55 0.22 25)",
  teal: "oklch(0.65 0.15 195)",
  amber: "oklch(0.72 0.17 60)",
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
        background: "oklch(0.19 0.04 155)",
        border: "1px solid oklch(1 0 0 / 6%)",
        "--tw-shadow": "0 4px 24px oklch(0 0 0 / 20%)",
      } as React.CSSProperties}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.7 }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2 truncate">
            {title}
          </div>
          <div
            className={cn("text-2xl font-bold text-white leading-none mb-1", valueClassName)}
          >
            {loading ? (
              <div className="h-7 w-24 rounded animate-pulse" style={{ background: "oklch(1 0 0 / 8%)" }} />
            ) : value}
          </div>
          {subtitle && (
            <div className="text-xs text-white/35 mt-1">
              {loading ? <div className="h-3 w-16 rounded animate-pulse" style={{ background: "oklch(1 0 0 / 6%)" }} /> : subtitle}
            </div>
          )}
          {change !== undefined && (
            <div className={cn("flex items-center gap-1 mt-2 text-xs font-medium")}>
              {isPositive && <TrendingUp size={12} style={{ color: "oklch(0.62 0.17 145)" }} />}
              {isNegative && <TrendingDown size={12} style={{ color: "oklch(0.55 0.22 25)" }} />}
              {!isPositive && !isNegative && <Minus size={12} className="text-white/30" />}
              <span
                style={{
                  color: isPositive
                    ? "oklch(0.75 0.17 145)"
                    : isNegative
                    ? "oklch(0.70 0.18 25)"
                    : "oklch(0.55 0.02 0)",
                }}
              >
                {change > 0 ? "+" : ""}{change?.toFixed(1)}%
              </span>
              {changeLabel && (
                <span className="text-white/25">{changeLabel}</span>
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
