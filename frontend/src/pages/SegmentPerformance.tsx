import { useState } from "react";
import { Menu } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import HeaderNav from "@/components/HeaderNav";

import {
  segmentPerformanceData,
  registrationsBySegment,
  depositsBySegment,
} from "@/data/segmentData";

const SegmentPerformance = () => {
  const [granularity, setGranularity] = useState("Weekly");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <DashboardSidebar
        granularity={granularity}
        onGranularityChange={setGranularity}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="flex-1 overflow-auto min-w-0">
        <header className="border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5 flex items-center gap-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">
              Segment Performance
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">February 2026</p>
          </div>
          <HeaderNav />
        </header>

        <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8">
          {/* Segment Tiles */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 rounded-full bg-primary" />
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  Segment Performance
                </h2>
              </div>
              <p className="text-xs text-orange-600 font-semibold">⚠️ DUMMY DATA</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {segmentPerformanceData.map((seg) => (
                <div
                  key={seg.name}
                  className="rounded-lg border border-border bg-card p-4 shadow-sm border-l-4"
                  style={{ borderLeftColor: seg.color }}
                >
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {seg.name}
                  </p>
                  <p className="text-xl font-bold text-card-foreground mt-1.5">
                    {seg.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {seg.pctOfTotal}% of Total
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Bar Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* Registrations by Segment */}
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <h3 className="text-base font-bold text-card-foreground mb-1">
                Registrations by Segment
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                February 2026 breakdown
              </p>
              <p className="text-xs text-orange-600 font-semibold mb-4">⚠️ DUMMY DATA</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={registrationsBySegment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 90%)" />
                  <XAxis dataKey="segment" tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(0, 0%, 100%)",
                      border: "1px solid hsl(220, 10%, 90%)",
                      borderRadius: "8px",
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="registrations" name="Registrations" radius={[4, 4, 0, 0]}>
                    {registrationsBySegment.map((_, i) => (
                      <Cell key={i} fill={segmentPerformanceData[i]?.color ?? "hsl(220, 5%, 46%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Total Deposits by Segment */}
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <h3 className="text-base font-bold text-card-foreground mb-1">
                Total Deposits by Segment
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                February 2026 breakdown
              </p>
              <p className="text-xs text-orange-600 font-semibold mb-4">⚠️ DUMMY DATA</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={depositsBySegment}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 90%)" />
                  <XAxis dataKey="segment" tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }} />
                  <YAxis
                    tick={{ fontSize: 12, fill: "hsl(220, 5%, 46%)" }}
                    tickFormatter={(v) => `R${(v / 1_000_000).toFixed(1)}M`}
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
                  <Bar dataKey="deposits" name="Deposits" radius={[4, 4, 0, 0]}>
                    {depositsBySegment.map((_, i) => (
                      <Cell key={i} fill={segmentPerformanceData[i]?.color ?? "hsl(220, 5%, 46%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SegmentPerformance;
