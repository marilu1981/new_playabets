import { useEffect, useState } from "react";
import { PieChart, Pie, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { fetchRfmSegments } from "../api";

type SegRow = { segment: string; users: number };

const COLORS = [
  "hsl(220, 70%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(280, 65%, 60%)",
  "hsl(10, 70%, 50%)",
  "hsl(190, 60%, 50%)",
  "hsl(50, 75%, 55%)",
  "hsl(340, 75%, 55%)",
];

export default function RfmSegmentsDonut() {
  const [data, setData] = useState<SegRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchRfmSegments()
      .then(setData)
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="text-red-500">RFM segments error: {err}</div>;
  if (!data.length) return <div>Loading RFM segments…</div>;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie 
            data={data} 
            dataKey="users" 
            nameKey="segment" 
            outerRadius="80%" 
            label
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
