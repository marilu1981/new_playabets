import DashboardLayout from "@/components/DashboardLayout";

export default function ChurnWarningPage() {
  return (
    <DashboardLayout
      title="Churn Warning"
      subtitle="RFM-based churn visuals have been removed from the dashboard."
    >
      <div
        className="rounded-xl p-6"
        style={{
          background: "#ffffff",
          border: "1px solid #dde8dd",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Module retired</h3>
        <p className="text-sm text-gray-600">
          All RFM segment charts and KPIs have been removed as requested.
        </p>
      </div>
    </DashboardLayout>
  );
}
