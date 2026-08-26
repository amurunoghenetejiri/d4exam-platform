/**
 * Online reconnection + background sync for offline-first reads.
 * Step 4: delegates to sync engine (outbox push + scoped pull).
 * Does not mutate UI layout. Safe to call from root bootstrap.
 */

import { getNetworkStatus, subscribeNetworkStatus, probeConnectivity } from "@/native/networkService";
import { offlineSet, OfflineKeys } from "@/lib/offline-cache";
import { runSyncEngine, type SyncEngineCtx } from "@/lib/sync/engine";
import { setConnectivityOnSnapshot } from "@/lib/sync/status";
import { resolveConnectivity } from "@/lib/sync/connectivity";

type SyncCtx = {
  userId: string;
  schoolId?: string | null;
  role?: string | null;
  studentId?: string | null;
  profileId?: string | null;
};

let lastSyncAt = 0;
let syncing = false;
const MIN_SYNC_GAP_MS = 8_000;

export type OfflineSyncListener = (info: {
  online: boolean;
  syncing: boolean;
  lastSyncAt: number;
}) => void;
const listeners = new Set<OfflineSyncListener>();

export function subscribeOfflineSync(cb: OfflineSyncListener): () => void {
  listeners.add(cb);
  cb({ online: getNetworkStatus().connected, syncing, lastSyncAt });
  return () => listeners.delete(cb);
}

function emit() {
  const online = getNetworkStatus().connected;
  listeners.forEach((cb) => {
    try {
      cb({ online, syncing, lastSyncAt });
    } catch {
      /* ignore */
    }
  });
}

export async function runOfflineSync(opts?: {
  queryClient?: { invalidateQueries: (opts?: unknown) => Promise<unknown> };
  ctx?: SyncCtx | null;
}): Promise<boolean> {
  if (syncing) return false;
  const now = Date.now();
  if (now - lastSyncAt < MIN_SYNC_GAP_MS) return false;

  const conn = await resolveConnectivity();
  setConnectivityOnSnapshot(conn.state, conn.internet);
  if (!conn.internet) {
    emit();
    return false;
  }

  syncing = true;
  emit();
  try {
    const engineCtx: SyncEngineCtx | null = opts?.ctx?.userId
      ? {
          userId: opts.ctx.userId,
          schoolId: opts.ctx.schoolId,
          role: opts.ctx.role,
          studentId: opts.ctx.studentId,
          profileId: opts.ctx.profileId,
          queryClient: opts.queryClient,
        }
      : opts?.queryClient
        ? { userId: "", queryClient: opts.queryClient }
        : null;

    const result = await runSyncEngine(engineCtx);

    if (opts?.ctx?.userId) {
      await offlineSet(
        opts.ctx.userId,
        OfflineKeys.settings,
        {
          lastBackgroundSyncAt: Date.now(),
          lastSyncStatus: result.status,
          lastSyncPushed: result.pushed,
          lastSyncPulled: result.pulled,
        },
        { schoolId: opts.ctx.schoolId },
      );
    }

    lastSyncAt = Date.now();
    return result.status === "SUCCESS" || result.status === "PARTIAL_SUCCESS";
  } catch {
    return false;
  } finally {
    syncing = false;
    emit();
  }
}

let unsubNet: (() => void) | null = null;
let bootstrapped = false;

export function bootstrapOfflineSync(getCtx: () => {
  queryClient?: { invalidateQueries: (opts?: unknown) => Promise<unknown> };
  ctx?: SyncCtx | null;
}): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (bootstrapped) return () => undefined;
  bootstrapped = true;

  unsubNet = subscribeNetworkStatus((status) => {
    emit();
    if (status.connected) {
      void runOfflineSync(getCtx());
    }
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void runOfflineSync(getCtx());
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  const t = window.setTimeout(() => {
    void runOfflineSync(getCtx());
  }, 1800);

  return () => {
    window.clearTimeout(t);
    document.removeEventListener("visibilitychange", onVisible);
    unsubNet?.();
    unsubNet = null;
    bootstrapped = false;
  };
}

/** Short in-app message for online-only actions (exam start, etc.). Never a page crash. */
export function requireOnlineMessage(): string {
  return "Internet connection required for this action.";
}

export function isOnlineNow(): boolean {
  return getNetworkStatus().connected;
}

export { probeConnectivity };
