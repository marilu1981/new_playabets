/**
 * PLAYA BETS — Client-Side API Cache
 * In-memory cache that persists across React page navigations (component unmounts).
 * Cache entries expire after TTL_MS (default 5 minutes).
 * This prevents re-fetching the same data every time the user navigates between pages.
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Module-level map — survives React component unmounts/remounts
const cache = new Map<string, CacheEntry<unknown>>();

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
}

/**
 * Fetch JSON with caching. Returns cached result immediately if available,
 * otherwise fetches from the network and caches the result.
 */
export async function cachedFetch<T>(url: string): Promise<T> {
  const cached = getCached<T>(url);
  if (cached !== null) return cached;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: T = await res.json();
  setCached(url, data);
  return data;
}
