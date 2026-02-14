import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fetchDailyKpis, type DailyKpiRow } from "../api";

interface IndexedDataPoint {
  date: string;
  registrations_index: number;
  settled_winnings_index: number;
  win_rate_index: number;
  ggr_index: number;
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

export default function IndexedRollingAverage() {
  const [data, setData] = useState<IndexedDataPoint[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDailyKpis({ 
      start: "2026-01-31",
      metrics: ["registrations", "settled_winnings", "win_rate", "ggr"]
    })
      .then((rows: DailyKpiRow[]) => {
        if (rows.length === 0) {
          setErr("No data available");
          setLoading(false);
          return;
        }

        // Extract values for each metric
        const registrations = rows.map(r => r.registrations || 0);
        const settledWinnings = rows.map(r => r.settled_winnings || 0);
        const winRate = rows.map(r => r.win_rate || 0);
        const ggr = rows.map(r => r.ggr || 0);

        // Calculate 3-day rolling averages
        const registrationsRolling = rollingAverage(registrations);
        const settledWinningsRolling = rollingAverage(settledWinnings);
        const winRateRolling = rollingAverage(winRate);
        const ggrRolling = rollingAverage(ggr);

        // Index to base 100 (first 6 days average)
        const registrationsIndexed = indexToBase100(registrationsRolling);
        const settledWinningsIndexed = indexToBase100(settledWinningsRolling);
        const winRateIndexed = indexToBase100(winRateRolling);
        const ggrIndexed = indexToBase100(ggrRolling);

        // Combine into chart data
        const chartData: IndexedDataPoint[] = rows.map((row, i) => ({
          date: row.date,
          registrations_index: Math.round(registrationsIndexed[i] * 100) / 100,
          settled_winnings_index: Math.round(settledWinningsIndexed[i] * 100) / 100,
          win_rate_index: Math.round(winRateIndexed[i] * 100) / 100,
          ggr_index: Math.round(ggrIndexed[i] * 100) / 100,
        }));

        setData(chartData);
        setLoading(false);
      })
      .catch((e) => {
        setErr(String(e));
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-muted-foreground">Loading indexed trends…</div>;
  if (err) return <div className="text-red-500">Error loading data: {err}</div>;
  if (!data.length) return <div className="text-muted-foreground">No data available</div>;

  return (
    <div className="h-96 w-full">
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
          <Legend 
            wrapperStyle={{ paddingTop: "20px" }}
          />
          <Line 
            type="monotone" 
            dataKey="registrations_index" 
            stroke="hsl(220, 70%, 50%)" 
            strokeWidth={2}
            dot={false} 
            name="Registrations (3d MA, Base 100)"
          />
          <Line 
            type="monotone" 
            dataKey="settled_winnings_index" 
            stroke="hsl(160, 60%, 45%)" 
            strokeWidth={2}
            dot={false} 
            name="Settled Winnings (3d MA, Base 100)"
          />
          <Line 
            type="monotone" 
            dataKey="win_rate_index" 
            stroke="hsl(30, 80%, 55%)" 
            strokeWidth={2}
            dot={false} 
            name="Win Rate (3d MA, Base 100)"
          />
          <Line 
            type="monotone" 
            dataKey="ggr_index" 
            stroke="hsl(280, 65%, 60%)" 
            strokeWidth={2}
            dot={false} 
            name="GGR (3d MA, Base 100)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
