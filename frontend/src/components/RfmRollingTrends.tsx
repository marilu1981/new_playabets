import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fetchRollingKpis } from "../api";

type Row = {
  date: string;
  bettors_daily: number;
  bets_daily: number;
};

interface IndexedDataPoint {
  date: string;
  bettors_daily_index: number;
  bets_daily_index: number;
}

/**
 * Calculate 3-day rolling average for a given array of values
 */
function rollingAverage(values: number[], window: number = 3): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      // Not enough data points yet, use available data
      const slice = values.slice(0, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    } else {
      const slice = values.slice(i - window + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / window);
    }
  }
  return result;
}

/**
 * Index values to base 100 using the average of the first 6 days
 */
function indexToBase100(values: number[]): number[] {
  if (values.length < 6) {
    return values.map(() => 100); // Not enough data
  }
  const base = values.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
  if (base === 0) return values.map(() => 100);
  return values.map(v => (v / base) * 100);
}

export default function RfmRollingTrends() {
  const [data, setData] = useState<IndexedDataPoint[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRollingKpis({ start: "2026-01-31" })
      .then((rows: Row[]) => {
        if (rows.length === 0) {
          setErr("No data available");
          setLoading(false);
          return;
        }

        // Extract values for each metric
        const bettorsDaily = rows.map(r => r.bettors_daily || 0);
        const betsDaily = rows.map(r => r.bets_daily || 0);

        // Calculate 3-day rolling averages
        const bettorsDailyRolling = rollingAverage(bettorsDaily);
        const betsDailyRolling = rollingAverage(betsDaily);

        // Index to base 100 (first 6 days average)
        const bettorsDailyIndexed = indexToBase100(bettorsDailyRolling);
        const betsDailyIndexed = indexToBase100(betsDailyRolling);

        // Combine into chart data
        const chartData: IndexedDataPoint[] = rows.map((row, i) => ({
          date: row.date,
          bettors_daily_index: Math.round(bettorsDailyIndexed[i] * 100) / 100,
          bets_daily_index: Math.round(betsDailyIndexed[i] * 100) / 100,
        }));

        setData(chartData);
        setLoading(false);
      })
      .catch((e) => {
        setErr(String(e));
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-muted-foreground">Loading RFM trends…</div>;
  if (err) return <div className="text-red-500">Rolling KPIs error: {err}</div>;
  if (!data.length) return <div className="text-muted-foreground">No data available</div>;

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 90%)" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis 
            tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }}
            label={{ value: "Index (Base 100)", angle: -90, position: "insideLeft" }}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: "hsl(0, 0%, 100%)",
              border: "1px solid hsl(220, 10%, 90%)",
              borderRadius: "8px",
              fontSize: 13,
            }}
            formatter={(value: number) => [value.toFixed(2), undefined]}
          />
          <Legend wrapperStyle={{ paddingTop: "20px" }} />
          <Line 
            type="monotone" 
            dataKey="bettors_daily_index" 
            stroke="hsl(220, 70%, 50%)" 
            strokeWidth={2}
            dot={false} 
            name="Daily Bettors (3d MA, Base 100)"
          />
          <Line 
            type="monotone" 
            dataKey="bets_daily_index" 
            stroke="hsl(160, 60%, 45%)" 
            strokeWidth={2}
            dot={false} 
            name="Daily Bets (3d MA, Base 100)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
