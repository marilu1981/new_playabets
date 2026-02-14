import { useState } from "react";
import { Menu } from "lucide-react";
import HeaderNav from "@/components/HeaderNav";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import PlayerAcquisitionChart from "@/components/dashboard/PlayerAcquisitionChart";
import SegmentPieChart from "@/components/dashboard/SegmentPieChart";
import { kpiData } from "@/data/dashboardData";

const Index = () => {
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
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">
              Gaming Activity Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">February 2026</p>
          </div>
          <HeaderNav />
        </header>

        <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8">
          {/* Executive Overview */}
          <section>
            <h2 className="text-base sm:text-lg font-bold text-foreground mb-1">Executive Overview</h2>
            <p className="text-sm text-muted-foreground mb-4 sm:mb-5">Primary KPIs</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
              <KpiCard
                title="Registrations"
                value={kpiData.registrations.value}
                change={kpiData.registrations.change}
                trend={kpiData.registrations.trend}
                delay={0}
              />
              <KpiCard
                title="FTDs"
                value={kpiData.ftds.value}
                change={kpiData.ftds.change}
                trend={kpiData.ftds.trend}
                delay={100}
              />
              <KpiCard
                title="Actives"
                value={kpiData.actives.value}
                change={kpiData.actives.change}
                trend={kpiData.actives.trend}
                delay={200}
              />
            </div>
          </section>

          {/* Detailed Overview */}
          <section>
            <h2 className="text-base sm:text-lg font-bold text-foreground mb-4 sm:mb-5">Detailed Overview</h2>
            <RevenueChart />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5 mt-4 sm:mt-5">
              <div className="lg:col-span-3">
                <PlayerAcquisitionChart />
              </div>
              <div className="lg:col-span-2">
                <SegmentPieChart />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Index;
