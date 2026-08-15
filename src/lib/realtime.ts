import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to Postgres changes and invalidate React Query keys.
 * Invalidations are debounced so bursts of DB events do not freeze the UI.
 */
export function useRealtimeInvalidate(
  channelName: string,
  tables: { table: string; filter?: string }[],
  queryKeys: (string | unknown[])[],
  enabled = true,
  debounceMs = 1500,
) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const flush = () => {
      timerRef.current = null;
      for (const key of queryKeys) {
        void qc.invalidateQueries({
          queryKey: Array.isArray(key) ? key : [key],
          refetchType: "active",
        });
      }
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, debounceMs);
    };

    const channel = supabase.channel(channelName);
    for (const t of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts: any = {
        event: "*",
        schema: "public",
        table: t.table,
      };
      if (t.filter) opts.filter = t.filter;
      channel.on("postgres_changes", opts, schedule);
    }
    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled, debounceMs, qc, JSON.stringify(tables), JSON.stringify(queryKeys)]);
}
