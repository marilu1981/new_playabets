import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { playerAcquisitionData } from "@/data/dashboardData";

const PlayerAcquisitionChart = () => (
  <div className="rounded-lg border border-border bg-card p-6 shadow-sm opacity-0 animate-fade-in" style={{ animationDelay: "400ms" }}>
    <h3 className="text-lg font-bold text-card-foreground mb-1">Player Acquisition</h3>
    <p className="text-sm text-muted-foreground mb-6">Registrations vs FTDs over time</p>
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={playerAcquisitionData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 90%)" />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }} />
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
        <Bar dataKey="registrations" name="Registrations" fill="hsl(82, 100%, 36%)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="ftds" name="FTDs" fill="hsl(0, 0%, 20%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

export default PlayerAcquisitionChart;
