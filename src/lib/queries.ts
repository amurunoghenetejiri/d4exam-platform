import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Filter = { column: string; value: string | number | null };

export interface TableQuery {
  table: string;
  select?: string;
  filters?: Filter[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  enabled?: boolean;
}

/** Database-backed list query. Returns [] when there is nothing to show. */
export function useRows<T = Record<string, unknown>>({
  table,
  select = "*",
  filters = [],
  order,
  limit = 200,
  enabled = true,
}: TableQuery) {
  return useQuery({
    queryKey: ["rows", table, select, filters, order, limit],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<T[]> => {
      let q = supabase.from(table as never).select(select).limit(limit);
      for (const f of filters) {
        if (f.value === null || f.value === undefined) continue;
        q = q.eq(f.column, f.value as never);
      }
      if (order) q = q.order(order.column, { ascending: order.ascending ?? false });
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
