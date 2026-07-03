/**
 * PLAYA BETS - Client-Side API Cache
 * In-memory cache that persists across React page navigations (component unmounts).
 * Cache entries expire after TTL_MS (30 minutes).
 * This prevents re-fetching the same data every time the user navigates between pages.
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes - DWH data updates once daily, no need to re-fetch frequently

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Module-level map - survives React component unmounts/remounts
const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(): void {
  cache.clear();
  inFlight.clear();
  _latestDataDate = null;
  try { sessionStorage.removeItem(LATEST_DATE_KEY); } catch { /* ignore */ }
}

// -- Persistent latestDataDate -------------------------------------------------
// Stored in sessionStorage so it survives React component unmount/remount AND
// cold page loads within the same browser session. Clears automatically when
// the tab is closed, so the next fresh session always re-validates with the API.
const LATEST_DATE_KEY = "pb_latest_data_date";
let _latestDataDate: string | null = (() => {
  try { return sessionStorage.getItem(LATEST_DATE_KEY); } catch { return null; }
})();

export function getLatestDataDate(): string | null {
  return _latestDataDate;
}

export function setLatestDataDate(date: string): void {
  _latestDataDate = date;
  try { sessionStorage.setItem(LATEST_DATE_KEY, date); } catch { /* ignore */ }
}

const LATEST_UPDATED_KEY = "pb_last_updated";
let _lastUpdated: string | null = (() => {
  try { return sessionStorage.getItem(LATEST_UPDATED_KEY); } catch { return null; }
})();

export function getLastUpdated(): string | null {
  return _lastUpdated;
}

export function setLastUpdated(ts: string): void {
  _lastUpdated = ts;
  try { sessionStorage.setItem(LATEST_UPDATED_KEY, ts); } catch { /* ignore */ }
}

/**
 * Fetch JSON with caching. Returns cached result immediately if available,
 * otherwise fetches from the network and caches the result.
 */
export async function cachedFetch<T>(url: string): Promise<T> {
  const cached = getCached<T>(url);
  if (cached !== null) return cached;

  const pending = inFlight.get(url) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const apiKey = (import.meta.env.VITE_API_KEY as string | undefined) ?? "";
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: T = await res.json();
    setCached(url, data);
    return data;
  })();

  inFlight.set(url, request as Promise<unknown>);
  try {
    return await request;
  } finally {
    inFlight.delete(url);
  }
}
