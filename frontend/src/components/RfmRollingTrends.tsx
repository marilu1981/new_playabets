import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fetchRollingKpis } from "../api";

type Row = {
  date: string;
  active_bettors_30d: number;
  ggr_per_active_30d: number;
  stake_per_active_30d: number;
};

export default function RfmRollingTrends() {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchRollingKpis({ limit: 180 })
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="text-red-500">Rolling KPIs error: {err}</div>;
  if (!rows.length) return <div>Loading rolling trends…</div>;

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 90%)" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }} 
          />
          <YAxis tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }} />
          <Tooltip 
            contentStyle={{
              backgroundColor: "hsl(0, 0%, 100%)",
              border: "1px solid hsl(220, 10%, 90%)",
              borderRadius: "8px",
              fontSize: 13,
            }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="active_bettors_30d" 
            stroke="hsl(220, 70%, 50%)" 
            strokeWidth={2}
            dot={false} 
            name="Active Bettors (30d)"
          />
          <Line 
            type="monotone" 
            dataKey="ggr_per_active_30d" 
            stroke="hsl(160, 60%, 45%)" 
            strokeWidth={2}
            dot={false} 
            name="GGR per Active (30d)"
          />
          <Line 
            type="monotone" 
            dataKey="stake_per_active_30d" 
            stroke="hsl(30, 80%, 55%)" 
            strokeWidth={2}
            dot={false} 
            name="Stake per Active (30d)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
