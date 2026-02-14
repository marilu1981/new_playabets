import * as XLSX from "xlsx";
import { MetricRow } from "@/data/metricsData";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MetricsTableProps {
  title: string;
  data: MetricRow[];
}

const exportToExcel = (data: MetricRow[], title: string) => {
  const ws = XLSX.utils.json_to_sheet(data.map(row => ({
    Metric: row.metric,
    "Current Period": row.currentPeriod,
    "Previous Period": row.previousPeriod,
    "Change %": row.change,
    YTD: row.ytd,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title);
  XLSX.writeFile(wb, `${title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const MetricsTable = ({ title, data }: MetricsTableProps) => {
  const isPositive = (val: string) => val.startsWith("+");
  const isZero = (val: string) => val === "0%";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <p className="text-xs text-orange-600 font-semibold mt-1">⚠️ DUMMY DATA</p>
        </div>
        <Button
          size="sm"
          onClick={() => exportToExcel(data, title)}
          className="bg-primary text-primary-foreground hover:bg-accent gap-2"
        >
          <Download className="h-4 w-4" />
          Export to Excel
        </Button>
      </div>
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[180px]">Metric</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[140px]">Current Period</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[140px]">Previous Period</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[100px]">Change %</th>
              <th className="text-left px-4 py-3 font-semibold text-foreground min-w-[120px]">YTD</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.metric} className={i % 2 === 0 ? "bg-card" : "bg-muted/40"}>
                <td className="px-4 py-3 font-medium text-foreground">{row.metric}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.currentPeriod}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.previousPeriod}</td>
                <td className={`px-4 py-3 font-semibold ${isPositive(row.change) ? "text-primary" : isZero(row.change) ? "text-muted-foreground" : "text-destructive"}`}>
                  {row.change}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.ytd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MetricsTable;
