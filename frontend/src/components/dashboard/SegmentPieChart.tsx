import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { segmentData } from "@/data/dashboardData";

const SegmentPieChart = () => (
  <div className="rounded-lg border border-border bg-card p-6 shadow-sm opacity-0 animate-fade-in" style={{ animationDelay: "500ms" }}>
    <h3 className="text-lg font-bold text-card-foreground mb-1">Segment Distribution</h3>
    <p className="text-sm text-muted-foreground mb-2">Actives — VIP, PVIP, Mass, Mix</p>
    <p className="text-xs text-orange-600 font-semibold mb-4">⚠️ DUMMY DATA</p>
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={segmentData}
          cx="50%"
          cy="50%"
          innerRadius={65}
          outerRadius={110}
          paddingAngle={3}
          dataKey="value"
          label={({ name, value }) => `${name} ${value}%`}
          labelLine={false}
        >
          {segmentData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => [`${value}%`, undefined]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  </div>
);

export default SegmentPieChart;
