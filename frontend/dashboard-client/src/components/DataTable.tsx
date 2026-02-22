/**
 * PLAYA BETS — DataTable Component
 * Reusable table with Savanna Gold styling
 */

import { cn } from "@/lib/utils";

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  className?: string;
  emptyMessage?: string;
  compact?: boolean;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  className,
  emptyMessage = "No data available",
  compact = false,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto rounded-lg", className)} style={{ border: "1px solid oklch(1 0 0 / 6%)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid oklch(1 0 0 / 8%)", background: "oklch(0.16 0.04 155)" }}>
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={cn(
                  "text-xs font-semibold uppercase tracking-wider text-white/40 whitespace-nowrap",
                  compact ? "px-3 py-2" : "px-4 py-3",
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center text-white/30 py-8 text-sm"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={i}
                className="transition-colors hover:bg-white/3"
                style={{ borderBottom: i < data.length - 1 ? "1px solid oklch(1 0 0 / 5%)" : "none" }}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn(
                      "text-white/75",
                      compact ? "px-3 py-2" : "px-4 py-3",
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                      col.mono && "font-mono text-xs"
                    )}
                    style={col.mono ? { fontFamily: "'Space Mono', monospace" } : {}}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key as keyof T] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
