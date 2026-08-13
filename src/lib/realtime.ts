import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to Postgres changes and invalidate React Query keys.
 * Cleans up on unmount.
 */
export function useRealtimeInvalidate(
  channelName: string,
  tables: { table: string; filter?: string }[],
  queryKeys: (string | unknown[])[],
  enabled = true,
) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || tables.length === 0) return;

    const channel = supabase.channel(channelName);
    for (const t of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts: any = {
        event: "*",
        schema: "public",
        table: t.table,
      };
      if (t.filter) opts.filter = t.filter;
      channel.on("postgres_changes", opts, () => {
        for (const key of queryKeys) {
          void qc.invalidateQueries({
            queryKey: Array.isArray(key) ? key : [key],
          });
        }
      });
    }
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName, enabled, qc, JSON.stringify(tables), JSON.stringify(queryKeys)]);
}
