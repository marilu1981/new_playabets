import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu } from "lucide-react";
import HeaderNav from "@/components/HeaderNav";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import KpiCard from "@/components/dashboard/KpiCard";
import RevenueChart from "@/components/dashboard/RevenueChart";
import PlayerAcquisitionChart from "@/components/dashboard/PlayerAcquisitionChart";
import SegmentPieChart from "@/components/dashboard/SegmentPieChart";
import { getKpisLatest, getKpisSeries } from "@/api";
import type { RevenueChartDatum } from "@/components/dashboard/RevenueChart";
import RfmSegmentsDonut from "@/components/RfmSegmentsDonut";
import RfmRollingTrends from "@/components/RfmRollingTrends";
import IndexedRollingAverage from "@/components/IndexedRollingAverage";

const toNum = (v: string | number | undefined): number =>
  typeof v === "number" && !Number.isNaN(v) ? v : typeof v === "string" ? Number(v) || 0 : 0;

const Index = () => {
  const [granularity, setGranularity] = useState("Weekly");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: latest, isLoading: kpisLoading, error: kpisError } = useQuery({
    queryKey: ["kpis", "latest"],
    queryFn: getKpisLatest,
  });

  const { data: ggrSeries } = useQuery({
    queryKey: ["kpis", "series", "ggr", 30],
    queryFn: () => getKpisSeries("ggr", 30),
  });
  const { data: turnoverSeries } = useQuery({
    queryKey: ["kpis", "series", "turnover", 30],
    queryFn: () => getKpisSeries("turnover", 30),
  });
  const { data: ngrSeries } = useQuery({
    queryKey: ["kpis", "series", "ngr", 30],
    queryFn: () => getKpisSeries("ngr", 30).catch(() => ({ metric: "ngr", days: 30, points: [] })),
  });

  const registrations = latest ? toNum(latest.registrations) : 0;
  const ftds = latest ? toNum(latest.ftds) : 0;
  const actives = latest ? toNum(latest.actives_sports ?? latest.actives) : 0;

  const revenueChartData: RevenueChartDatum[] | null =
    ggrSeries?.points?.length || turnoverSeries?.points?.length
      ? (() => {
          const byDate: Record<string, RevenueChartDatum> = {};
          ggrSeries?.points?.forEach((p) => {
            byDate[p.date] = { ...byDate[p.date], date: p.date, ggr: p.value ?? undefined };
          });
          turnoverSeries?.points?.forEach((p) => {
            byDate[p.date] = { ...byDate[p.date], date: p.date, turnover: p.value ?? undefined };
          });
          ngrSeries?.points?.forEach((p) => {
            byDate[p.date] = { ...byDate[p.date], date: p.date, ngr: p.value ?? undefined };
          });
          return Object.values(byDate).sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
        })()
      : null;

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
                value={kpisLoading || kpisError ? 0 : registrations}
                change={0}
                trend="neutral"
                delay={0}
              />
              <KpiCard
                title="FTDs"
                value={kpisLoading || kpisError ? 0 : ftds}
                change={0}
                trend="neutral"
                delay={100}
              />
              <KpiCard
                title="Actives"
                value={kpisLoading || kpisError ? 0 : actives}
                change={0}
                trend="neutral"
                delay={200}
              />
            </div>
            {(kpisLoading || kpisError) && (
              <p className="text-sm text-muted-foreground mt-2">
                {kpisLoading ? "Loading KPIs…" : kpisError ? "Could not load KPIs. Is the API running?" : null}
              </p>
            )}
          </section>

          {/* Indexed KPI Trends */}
          <section>
            <h2 className="text-base sm:text-lg font-bold text-foreground mb-4 sm:mb-5">Indexed KPI Trends</h2>
            <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-sm">
              <h3 className="text-base font-bold text-card-foreground mb-4">
                3-Day Rolling Average (Base 100 Index)
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Indexed to first 6 days average • Jan 31, 2026 onwards
              </p>
              <IndexedRollingAverage />
            </div>
          </section>

          {/* RFM Analysis */}
          <section>
            <h2 className="text-base sm:text-lg font-bold text-foreground mb-4 sm:mb-5">RFM Analysis</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-sm">
                <h3 className="text-base font-bold text-card-foreground mb-4">RFM Segments</h3>
                <RfmSegmentsDonut />
              </div>
              <div className="rounded-lg border border-border bg-card p-4 sm:p-6 shadow-sm">
                <h3 className="text-base font-bold text-card-foreground mb-4">Rolling RFM Trends (30d)</h3>
                <RfmRollingTrends />
              </div>
            </div>
          </section>

          {/* Detailed Overview */}
          <section>
            <h2 className="text-base sm:text-lg font-bold text-foreground mb-4 sm:mb-5">Detailed Overview</h2>
            <RevenueChart data={revenueChartData} />

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
