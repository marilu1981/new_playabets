import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: number;
  change: number;
  trend: "up" | "down" | "neutral";
  delay?: number;
}

const KpiCard = ({ title, value, change, trend, delay = 0 }: KpiCardProps) => {
  const trendIcon = {
    up: <TrendingUp className="h-4 w-4" />,
    down: <TrendingDown className="h-4 w-4" />,
    neutral: <Minus className="h-4 w-4" />,
  };

  const trendColor = {
    up: "text-primary",
    down: "text-destructive",
    neutral: "text-muted-foreground",
  };

  const trendSymbol = {
    up: "▲",
    down: "▼",
    neutral: "─",
  };

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 shadow-sm opacity-0 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      <div className="mt-1.5 flex flex-col sm:flex-row sm:items-end justify-between gap-1">
        <p className="text-xl font-bold text-card-foreground">
          {value.toLocaleString()}
        </p>
        <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor[trend]}`}>
          {trendIcon[trend]}
          <span>
            {trendSymbol[trend]} {Math.abs(change)}% vs Last Month
          </span>
        </div>
      </div>
    </div>
  );
};

export default KpiCard;
