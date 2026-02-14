import { useState } from "react";
import { Menu } from "lucide-react";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import MetricsTable from "@/components/metrics/MetricsTable";
import HeaderNav from "@/components/HeaderNav";
import { overviewMetrics, sportMetrics, casinoMetrics, allMetrics } from "@/data/metricsData";
import { cn } from "@/lib/utils";

const tabs = ["Overview", "Sport Details", "Casino Details", "All Metrics"] as const;
type Tab = typeof tabs[number];

const tabConfig: Record<Tab, { title: string; data: typeof overviewMetrics }> = {
  Overview: { title: "Summary Metrics", data: overviewMetrics },
  "Sport Details": { title: "Sport Metrics", data: sportMetrics },
  "Casino Details": { title: "Casino Metrics", data: casinoMetrics },
  "All Metrics": { title: "All Metrics", data: allMetrics },
};

const Metrics = () => {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
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
        {/* Header */}
        <header className="border-b border-border bg-card px-4 sm:px-8 py-4 sm:py-5 flex items-center gap-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-md hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">Metrics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">February 2026</p>
          </div>
          <HeaderNav />
        </header>

        <div className="px-4 sm:px-8 py-4 sm:py-6">
          {/* Tabs */}
          <div className="border-b border-border mb-6 overflow-x-auto">
            <div className="flex gap-0 min-w-max">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-4 sm:px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2",
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <MetricsTable title={tabConfig[activeTab].title} data={tabConfig[activeTab].data} />
        </div>
      </main>
    </div>
  );
};

export default Metrics;
