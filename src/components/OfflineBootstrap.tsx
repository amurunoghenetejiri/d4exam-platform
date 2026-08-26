import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bootstrapOfflineSync } from "@/lib/offline-sync";
import { useSessionUser } from "@/lib/session";

/**
 * Mounts offline sync + reconnect invalidation.
 * Starts after a short delay so login/home UI stay responsive.
 */
export function OfflineBootstrap() {
  const queryClient = useQueryClient();
  const { data: session } = useSessionUser();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const t = window.setTimeout(() => {
      cleanup = bootstrapOfflineSync(() => ({
        queryClient,
        ctx: session
          ? {
              userId: session.userId,
              schoolId: session.schoolId,
              role: session.role,
            }
          : null,
      }));
    }, 2000);
    return () => {
      window.clearTimeout(t);
      cleanup?.();
    };
  }, [queryClient, session?.userId, session?.schoolId, session?.role]);

  return null;
}
