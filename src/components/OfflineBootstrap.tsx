import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bootstrapOfflineSync } from "@/lib/offline-sync";
import { useSessionUser } from "@/lib/session";

/**
 * Mounts offline sync + reconnect invalidation.
 * No visible UI — does not change layout.
 */
export function OfflineBootstrap() {
  const queryClient = useQueryClient();
  const { data: session } = useSessionUser();

  useEffect(() => {
    return bootstrapOfflineSync(() => ({
      queryClient: queryClient as unknown as {
        invalidateQueries: (opts?: unknown) => Promise<unknown>;
      },
      ctx: session
        ? {
            userId: session.userId,
            schoolId: session.schoolId,
            role: session.role,
            profileId: session.profileId,
            studentId:
              session.role === "student"
                ? session.identifier || session.profileId
                : null,
          }
        : null,
    }));
  }, [
    queryClient,
    session?.userId,
    session?.schoolId,
    session?.role,
    session?.profileId,
    session?.identifier,
  ]);

  return null;
}
