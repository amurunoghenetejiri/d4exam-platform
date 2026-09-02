/**
 * Offline-first reads + network refresh.
 * LOCAL FIRST → display → if online refresh → update local → update UI.
 * Never throws when a cached value exists. Soft empty when offline with no cache.
 */
import { useQuery, type UseQueryOptions, type QueryKey } from "@tanstack/react-query";
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

function isNetworkError(err: unknown): boolean {
  const m = String((err as Error)?.message ?? err ?? "").toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("offline") ||
    m.includes("timeout") ||
    m.includes("abort") ||
    m.includes("load failed") ||
    m.includes("networkerror")
  );
}

/**
 * LOCAL-FIRST data access used by every offline-supported page.
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
    return null as T;
  }

  if (localFirst && local !== null) {
    void (async () => {
      try {
        const data = await fetcher();
        if (userId) {
          void offlineSet(userId, key, data, { schoolId: opts?.schoolId });
          void mirrorByOfflineKey(userId, key, data as never, opts?.schoolId);
        }
      } catch (err) {
        console.warn("[offline-query] background refresh failed", key, err);
      }
    })();
    return local;
  }

  try {
    const data = await fetcher();
    if (userId) {
      void offlineSet(userId, key, data, { schoolId: opts?.schoolId });
      void mirrorByOfflineKey(userId, key, data as never, opts?.schoolId);
    }
    return data;
  } catch (err) {
    console.warn("[offline-query] network failed, using cache", key, err);
    if (local !== null) return local;
    if (opts && Object.prototype.hasOwnProperty.call(opts, "fallback")) {
      return opts.fallback as T;
    }
    if (isNetworkError(err)) {
      return null as T;
    }
    throw err;
  }
}

/**
 * React Query helper: always local-first, never hard-fails offline.
 */
export function useOfflineQuery<T>(
  opts: {
    queryKey: QueryKey;
    userId: string | null | undefined;
    cacheKey: string;
    schoolId?: string | null;
    enabled?: boolean;
    fallback?: T;
    staleTime?: number;
    fetcher: () => Promise<T>;
  } & Partial<Pick<UseQueryOptions<T, Error>, "gcTime" | "refetchOnWindowFocus" | "refetchOnMount">>,
) {
  const {
    queryKey,
    userId,
    cacheKey,
    schoolId,
    enabled = true,
    fallback,
    staleTime = 5 * 60_000,
    fetcher,
    gcTime,
    refetchOnWindowFocus,
    refetchOnMount,
  } = opts;

  return useQuery({
    queryKey,
    enabled,
    staleTime,
    gcTime: gcTime ?? 30 * 60_000,
    refetchOnWindowFocus: refetchOnWindowFocus ?? false,
    refetchOnMount: refetchOnMount ?? true,
    networkMode: "offlineFirst",
    retry: (count, err) => {
      if (!isOnlineNow()) return false;
      if (isNetworkError(err)) return count < 1;
      return count < 1;
    },
    queryFn: async () =>
      withOfflineCache(userId, cacheKey, fetcher, {
        schoolId,
        fallback: (fallback as T) ?? (null as T),
      }),
  });
}

/** User-facing copy when a page has never been synced. */
export const OFFLINE_EMPTY_MESSAGE =
  "Content not available offline yet. Connect to the Internet once to download this content.";

export const OFFLINE_USING_SAVED = "You're offline — showing saved data.";
