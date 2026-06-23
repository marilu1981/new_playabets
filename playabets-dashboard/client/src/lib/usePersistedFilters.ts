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

function getDefaultDateRange(): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const dateTo = today.toISOString().slice(0, 10);
  const from = new Date(today);
  from.setDate(today.getDate() - 30);
  const dateFrom = from.toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

function getInitialFilters(): DashboardFilters {
  // 1. Try localStorage (user's last explicit selection)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DashboardFilters;
      if (parsed.dateFrom && parsed.dateTo) return parsed;
    }
  } catch {}

  // 2. Default: start of previous month → today
  return { ...defaultFilters, ...getDefaultDateRange() };
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
