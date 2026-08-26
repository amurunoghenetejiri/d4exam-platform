import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withOfflineCache, readLastUserId } from "@/lib/offline-query";
import { OfflineKeys } from "@/lib/offline-cache";
import { isOnlineNow } from "@/lib/offline-sync";

type Filter = { column: string; value: string | number | boolean | null | undefined };

function filterKey(filters: Filter[]) {
  return filters.map((f) => `${f.column}=${String(f.value)}`).join("&");
}

export function useRows<T = Record<string, unknown>>(opts: {
  table: string;
  select?: string;
  filters?: Filter[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  enabled?: boolean;
  userId?: string | null;
}) {
  const { table, select = "*", filters = [], order, limit = 100, enabled = true, userId } = opts;
  const cacheKey = `${OfflineKeys.rowsPrefix}${table}:${select}:${filterKey(filters)}:${order?.column ?? ""}:${limit}`;

  return useQuery({
    queryKey: ["rows", table, select, filters, order, limit],
    enabled,
    staleTime: 15_000,
    networkMode: "offlineFirst",
    retry: 0,
    queryFn: async () => {
      const uid = userId ?? readLastUserId();
      return withOfflineCache(
        uid,
        cacheKey,
        async () => {
          let q = supabase.from(table as never).select(select);
          for (const f of filters) {
            if (f.value === null || f.value === undefined) continue;
            q = q.eq(f.column, f.value as never);
          }
          if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
          if (limit) q = q.limit(limit);
          const { data, error } = await q;
          if (error) {
            console.warn(`[useRows] ${table}`, error);
            return [] as T[];
          }
          return (data ?? []) as T[];
        },
        { fallback: [] as T[] },
      );
    },
  });
}

/** Row count for dashboard statistics. Cached hard to avoid shell lag. */
export function useCount(table: string, filters: Filter[] = [], enabled = true) {
  const cacheKey = `${OfflineKeys.rowsPrefix}count:${table}:${filterKey(filters)}`;
  return useQuery({
    queryKey: ["count", table, filters],
    enabled,
    staleTime: 5 * 60_000,
    networkMode: "offlineFirst",
    retry: 0,
    queryFn: async () => {
      const uid = readLastUserId();
      return withOfflineCache(
        uid,
        cacheKey,
        async () => {
          let q = supabase.from(table as never).select("*", { count: "exact", head: true });
          for (const f of filters) {
            if (f.value === null || f.value === undefined) continue;
            q = q.eq(f.column, f.value as never);
          }
          const { count, error } = await q;
          if (error) {
            console.warn(`[useCount] ${table}`, error);
            return 0;
          }
          return count ?? 0;
        },
        { fallback: 0 },
      );
    },
  });
}

/** Unread notifications for the signed-in user (read_at IS NULL). */
export function useUnreadNotificationCount(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["count", "notifications", "unread", userId],
    enabled: Boolean(userId),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: isOnlineNow() ? 30_000 : false,
    networkMode: "offlineFirst",
    retry: 0,
    queryFn: async () => {
      if (!userId) return 0;
      return withOfflineCache(
        userId,
        OfflineKeys.unreadNotifications,
        async () => {
          const { count, error } = await supabase
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("recipient_user_id", userId)
            .is("read_at", null);
          if (error) {
            console.warn("[useUnreadNotificationCount]", error);
            return 0;
          }
          return count ?? 0;
        },
        { fallback: 0 },
      );
    },
  });
}
