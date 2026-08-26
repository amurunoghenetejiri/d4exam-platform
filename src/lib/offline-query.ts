/**
 * Offline student mode — local-first reads + network refresh.
 * Never throws when a cached value exists. Does not change UI.
 */
import { offlineGet, offlineSet } from "@/lib/offline-cache";
import { isOnlineNow } from "@/lib/offline-sync";
import { mirrorByOfflineKey, readOfflineBlob } from "@/lib/local-db/mirror";

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

async function readAnyLocalCache<T>(userId: string | null | undefined, key: string): Promise<T | null> {
  const tryUser = async (uid: string) => {
    const cached = await offlineGet<T>(uid, key);
    if (cached && cached.data !== undefined) return cached.data;
    const blob = await readOfflineBlob<T>(uid, key);
    if (blob !== null && blob !== undefined) return blob;
    return null;
  };

  if (userId) {
    const v = await tryUser(userId);
    if (v !== null) return v;
  }
  const last = readLastUserId();
  if (last && last !== userId) {
    return tryUser(last);
  }
  return null;
}

/**
 * LOCAL-FIRST:
 * 1. Serve local cache when available (online or offline).
 * 2. When online, refresh from network and update caches.
 * 3. When offline, never hammer the network; return cache or soft fallback.
 */
export async function withOfflineCache<T>(
  userId: string | null | undefined,
  key: string,
  fetcher: () => Promise<T>,
  opts?: {
    schoolId?: string | null;
    fallback?: T;
    skipNetworkWhenOffline?: boolean;
    localFirst?: boolean;
  },
): Promise<T> {
  const localFirst = opts?.localFirst !== false;
  const offline = opts?.skipNetworkWhenOffline !== false && !isOnlineNow();

  const local = await readAnyLocalCache<T>(userId, key);

  if (offline) {
    if (local !== null) return local;
    if (opts && Object.prototype.hasOwnProperty.call(opts, "fallback")) {
      return opts.fallback as T;
    }
    return (Array.isArray(opts?.fallback) ? opts!.fallback : (null as T)) as T;
  }

  if (localFirst && local !== null) {
    void (async () => {
      try {
        const data = await fetcher();
        if (userId) {
          void offlineSet(userId, key, data, { schoolId: opts?.schoolId });
          void mirrorByOfflineKey(userId, key, data, { schoolId: opts?.schoolId });
          rememberLastUserId(userId);
        }
      } catch {
        /* keep local */
      }
    })();
    try {
      const data = await Promise.race([
        fetcher(),
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error("slow")), 2500)),
      ]);
      if (userId) {
        void offlineSet(userId, key, data, { schoolId: opts?.schoolId });
        void mirrorByOfflineKey(userId, key, data, { schoolId: opts?.schoolId });
        rememberLastUserId(userId);
      }
      return data;
    } catch {
      return local;
    }
  }

  try {
    const data = await fetcher();
    if (userId) {
      void offlineSet(userId, key, data, { schoolId: opts?.schoolId });
      void mirrorByOfflineKey(userId, key, data, { schoolId: opts?.schoolId });
      rememberLastUserId(userId);
    }
    return data;
  } catch (err) {
    console.warn("[offline-query] network failed, using cache", key, err);
    if (local !== null) return local;
    if (opts && Object.prototype.hasOwnProperty.call(opts, "fallback")) {
      return opts.fallback as T;
    }
    return (Array.isArray(opts?.fallback) ? opts!.fallback : (null as T)) as T;
  }
}
