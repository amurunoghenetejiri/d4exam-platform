/**
 * Offline student mode — network-else-cache reads.
 * Never throws when a cached value exists. Does not change UI.
 */
import { offlineGet, offlineSet } from "@/lib/offline-cache";
import { isOnlineNow } from "@/lib/offline-sync";

const LAST_USER_KEY = "d4exam.lastUserId";

export function rememberLastUserId(userId: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (userId) localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    /* private mode */
  }
}

export function readLastUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

/**
 * Run fetcher when online; on failure or offline return IndexedDB cache.
 * If no cache and fallback provided, return fallback (pages stay up).
 */
export async function withOfflineCache<T>(
  userId: string | null | undefined,
  key: string,
  fetcher: () => Promise<T>,
  opts?: {
    schoolId?: string | null;
    fallback?: T;
    /** Prefer cache when offline without attempting network */
    skipNetworkWhenOffline?: boolean;
  },
): Promise<T> {
  const skipNet = opts?.skipNetworkWhenOffline !== false && !isOnlineNow();

  if (!skipNet) {
    try {
      const data = await fetcher();
      if (userId) {
        void offlineSet(userId, key, data, { schoolId: opts?.schoolId });
        rememberLastUserId(userId);
      }
      return data;
    } catch (err) {
      console.warn("[offline-query] network failed, trying cache", key, err);
    }
  }

  if (userId) {
    const cached = await offlineGet<T>(userId, key);
    if (cached && cached.data !== undefined) {
      return cached.data;
    }
  }

  // Try last known user if caller had no userId yet (cold start offline)
  const last = readLastUserId();
  if (last && last !== userId) {
    const cached = await offlineGet<T>(last, key);
    if (cached && cached.data !== undefined) {
      return cached.data;
    }
  }

  if (opts && Object.prototype.hasOwnProperty.call(opts, "fallback")) {
    return opts.fallback as T;
  }

  // Soft empty rather than crash student pages
  return (Array.isArray(opts?.fallback) ? opts!.fallback : (null as T)) as T;
}
