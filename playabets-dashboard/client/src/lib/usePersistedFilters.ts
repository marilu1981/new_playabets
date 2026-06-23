/**
 * usePersistedFilters — shares the selected date range across all dashboard pages.
 *
 * Stores filters in localStorage under "pb_dashboard_filters" so navigating
 * between pages preserves the user's date selection. On first load uses the
 * current month of the latest data date (from apiCache) as the default.
 */
import { useState, useEffect } from "react";
import { defaultFilters, type DashboardFilters } from "@/components/TopFiltersBar";
import { getLatestDataDate } from "@/lib/apiCache";

const STORAGE_KEY = "pb_dashboard_filters";

function getInitialFilters(): DashboardFilters {
  // 1. Try localStorage (user's last selection)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DashboardFilters;
      if (parsed.dateFrom && parsed.dateTo) return parsed;
    }
  } catch {}

  // 2. Fall back to current month of latest data date
  const latest = getLatestDataDate();
  if (latest && /^\d{4}-\d{2}-\d{2}$/.test(latest)) {
    return { ...defaultFilters, dateFrom: `${latest.slice(0, 7)}-01`, dateTo: latest };
  }

  return defaultFilters;
}

export function usePersistedFilters(): [DashboardFilters, (f: DashboardFilters) => void] {
  const [filters, setFiltersState] = useState<DashboardFilters>(getInitialFilters);

  const setFilters = (f: DashboardFilters) => {
    setFiltersState(f);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
    } catch {}
  };

  // Keep in sync if another tab updates (optional but nice)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as DashboardFilters;
          if (parsed.dateFrom && parsed.dateTo) setFiltersState(parsed);
        } catch {}
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return [filters, setFilters];
}
