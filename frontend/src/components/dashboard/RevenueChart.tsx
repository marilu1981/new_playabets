import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { revenueData } from "@/data/dashboardData";

const RevenueChart = () => (
  <div className="rounded-lg border border-border bg-card p-6 shadow-sm opacity-0 animate-fade-in" style={{ animationDelay: "300ms" }}>
    <h3 className="text-lg font-bold text-card-foreground mb-1">Revenue Trends</h3>
    <p className="text-sm text-muted-foreground mb-6">Month over Month — GGR, NGR, Turnover</p>
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={revenueData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 90%)" />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }} />
        <YAxis
          tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(0, 0%, 100%)",
            border: "1px solid hsl(220, 10%, 90%)",
            borderRadius: "8px",
            fontSize: 13,
          }}
          formatter={(value: number) => [`R ${value.toLocaleString()}`, undefined]}
        />
        <Legend />
        <Line type="monotone" dataKey="ggr" name="GGR" stroke="hsl(82, 100%, 36%)" strokeWidth={2.5} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="ngr" name="NGR" stroke="hsl(0, 0%, 20%)" strokeWidth={2.5} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="turnover" name="Turnover" stroke="hsl(42, 100%, 50%)" strokeWidth={2.5} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export default RevenueChart;
