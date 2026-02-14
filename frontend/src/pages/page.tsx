import RevenueChart from "@/components/dashboard/RevenueChart";

async function getLatest() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/kpis/latest`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch latest KPIs");
  return res.json();
}

async function getSeries(metric: string, days = 30) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/kpis/series?metric=${encodeURIComponent(metric)}&days=${days}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch KPI series");
  return res.json();
}

export default async function Dashboard() {
  const latest = await getLatest();
  const revenueSeries = await getSeries("revenue", 30);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <div className="flex gap-4 mb-6">
        <KpiCard title="Incremental Users" value={latest.incremental_users} subtitle={latest.date} />
        <KpiCard title="Incremental Betslips" value={latest.incremental_betslips} subtitle={latest.date} />
        <KpiCard title="Revenue" value={latest.revenue} subtitle={latest.date} />
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-2">Revenue (last 30 days)</h2>
        <RevenueChart />
      </div>
    </main>
  );
}

function KpiCard({ title, value, subtitle }: { title: string; value: any; subtitle?: string }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 min-w-[180px]">
      <div className="text-xs text-gray-500 mb-1">{title}</div>
      <div className="text-2xl font-bold">{value ?? "—"}</div>
      {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
    </div>
  );
}
