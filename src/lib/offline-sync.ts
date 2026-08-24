/**
 * Online reconnection + background sync for offline-first reads.
 * Does not mutate UI layout. Safe to call from root bootstrap.
 */

import { getNetworkStatus, subscribeNetworkStatus, probeConnectivity } from "@/native/networkService";
import { offlineSet, OfflineKeys } from "@/lib/offline-cache";

type SyncCtx = {
  userId: string;
  schoolId?: string | null;
  role?: string | null;
};

let lastSyncAt = 0;
let syncing = false;
const MIN_SYNC_GAP_MS = 8_000;

export type OfflineSyncListener = (info: { online: boolean; syncing: boolean; lastSyncAt: number }) => void;
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

  const online = await probeConnectivity();
  if (!online) {
    emit();
    return false;
  }

  syncing = true;
  emit();
  try {
    const qc = opts?.queryClient;
    if (qc) {
      await Promise.race([
        qc.invalidateQueries(),
        new Promise((r) => setTimeout(r, 12_000)),
      ]);
    }
    lastSyncAt = Date.now();
    if (opts?.ctx?.userId) {
      await offlineSet(opts.ctx.userId, OfflineKeys.settings, {
        lastBackgroundSyncAt: lastSyncAt,
      }, { schoolId: opts.ctx.schoolId });
    }
    return true;
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

  const t = window.setTimeout(() => {
    void runOfflineSync(getCtx());
  }, 1500);

  return () => {
    window.clearTimeout(t);
    unsubNet?.();
    unsubNet = null;
    bootstrapped = false;
  };
}

export function requireOnlineMessage(): string {
  return "Internet connection required for this action. Please reconnect and try again.";
}

export function isOnlineNow(): boolean {
  return getNetworkStatus().connected;
}
