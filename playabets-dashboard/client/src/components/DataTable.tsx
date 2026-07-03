/**
 * PLAYA BETS - DataTable Component
 * Reusable table with Savanna Gold styling.
 * Use `light` prop when the table sits inside a white/light card.
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
  /** Use light mode (dark text) when embedded in a white/light card */
  light?: boolean;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  className,
  emptyMessage = "No data available",
  compact = false,
  light = false,
}: DataTableProps<T>) {
  return (
    <div
      className={cn("overflow-x-auto rounded-lg", className)}
      style={{ border: `1px solid ${light ? "#e5e7eb" : "oklch(1 0 0 / 6%)"}` }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: `1px solid ${light ? "#d1d5db" : "oklch(1 0 0 / 8%)"}`, background: "oklch(0.16 0.04 155)" }}>
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
                className={cn("text-center py-8 text-sm", light ? "text-gray-400" : "text-white/30")}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={i}
                className={cn("transition-colors", light ? "hover:bg-gray-50" : "hover:bg-white/3")}
                style={{ borderBottom: i < data.length - 1 ? `1px solid ${light ? "#f3f4f6" : "oklch(1 0 0 / 5%)"}` : "none" }}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn(
                      light ? "text-gray-700" : "text-white/75",
                      compact ? "px-3 py-2" : "px-4 py-3",
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                      col.mono && "font-mono text-xs"
                    )}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key as keyof T] ?? "-")}
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
