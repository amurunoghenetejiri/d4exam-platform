import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Filter = { column: string; value: string | number | boolean | null | undefined };

export function useRows<T = Record<string, unknown>>(opts: {
  table: string;
  select?: string;
  filters?: Filter[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  enabled?: boolean;
}) {
  const { table, select = "*", filters = [], order, limit = 100, enabled = true } = opts;
  return useQuery({
    queryKey: ["rows", table, select, filters, order, limit],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase.from(table as never).select(select);
      for (const f of filters) {
        if (f.value === null || f.value === undefined) continue;
        q = q.eq(f.column, f.value as never);
      }
      if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

/** Row count for dashboard statistics. Cached hard to avoid shell lag. */
export function useCount(table: string, filters: Filter[] = [], enabled = true) {
  return useQuery({
    queryKey: ["count", table, filters],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let q = supabase.from(table as never).select("*", { count: "exact", head: true });
      for (const f of filters) {
        if (f.value === null || f.value === undefined) continue;
        q = q.eq(f.column, f.value as never);
      }
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Unread notifications for the signed-in user (read_at IS NULL). */
export function useUnreadNotificationCount(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["count", "notifications", "unread", userId],
    enabled: Boolean(userId),
    staleTime: 8_000,
    refetchOnWindowFocus: true,
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_user_id", userId)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
