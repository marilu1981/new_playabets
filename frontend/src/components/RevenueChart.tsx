"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function RevenueChart({ points }: { points: Array<{ date: string; value: number | null }> }) {
  // fill nulls with zero so the chart renders; optional
  const data = (points ?? []).map((p) => ({ ...p, value: p.value ?? 0 }));

  return (
    <div style={{ height: 300 }} className="border border-gray-200 rounded-xl p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="value" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
