import type { SyncEngineStatus, SyncPhase, SyncRunResult, SyncSnapshot, ConnectivityState } from "./types";
import { listPendingOutbox } from "@/lib/local-db/repositories/outboxRepo";
import { initLocalDb, getLocalDb } from "@/lib/local-db/connection";

let snapshot: SyncSnapshot = {
  status: "IDLE",
  phase: "idle",
  lastSuccessAt: null,
  lastAttemptAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  online: true,
  connectivity: "unknown",
  lastResult: null,
};

type Listener = (s: SyncSnapshot) => void;
const listeners = new Set<Listener>();

export function getSyncSnapshot(): SyncSnapshot {
  return { ...snapshot };
}

export function subscribeSyncStatus(cb: Listener): () => void {
  listeners.add(cb);
  try {
    cb(getSyncSnapshot());
  } catch {
    /* ignore */
  }
  return () => listeners.delete(cb);
}

function emit() {
  const s = getSyncSnapshot();
  listeners.forEach((cb) => {
    try {
      cb(s);
    } catch {
      /* ignore */
    }
  });
}

export function setSyncPhase(phase: SyncPhase, status?: SyncEngineStatus) {
  snapshot = {
    ...snapshot,
    phase,
    status: status ?? (phase === "idle" || phase === "done" ? snapshot.status : "SYNCING"),
  };
  emit();
}

export function setConnectivityOnSnapshot(connectivity: ConnectivityState, online: boolean) {
  snapshot = {
    ...snapshot,
    connectivity,
    online,
    status: online ? (snapshot.status === "OFFLINE" ? "IDLE" : snapshot.status) : "OFFLINE",
  };
  emit();
}

export async function refreshPendingCounts(): Promise<void> {
  try {
    await initLocalDb();
    const pending = await listPendingOutbox(500);
    snapshot = {
      ...snapshot,
      pendingCount: pending.filter((p) => p.status === "pending").length,
      failedCount: pending.filter((p) => p.status === "failed").length,
    };
    emit();
  } catch {
    /* ignore */
  }
}

export async function recordSyncResult(result: SyncRunResult): Promise<void> {
  snapshot = {
    ...snapshot,
    status: result.status,
    phase: result.status === "FAILED" ? "failed" : "done",
    lastAttemptAt: result.finishedAt,
    lastSuccessAt:
      result.status === "SUCCESS" || result.status === "PARTIAL_SUCCESS"
        ? result.finishedAt
        : snapshot.lastSuccessAt,
    pendingCount: result.pendingRemaining,
    failedCount: result.failed,
    conflictCount: result.conflicts,
    connectivity: result.connectivity,
    online: result.connectivity === "online",
    lastResult: result,
  };
  emit();

  try {
    await initLocalDb();
    const db = getLocalDb();
    if (!db) return;
    await db.execute(
      `INSERT OR REPLACE INTO local_meta (key, value, updated_at) VALUES (?,?,datetime('now'))`,
      [
        "sync:last_result",
        JSON.stringify({
          status: result.status,
          finishedAt: result.finishedAt,
          pushed: result.pushed,
          pulled: result.pulled,
          failed: result.failed,
        }),
      ],
    );
    if (result.status === "SUCCESS" || result.status === "PARTIAL_SUCCESS") {
      await db.execute(
        `INSERT OR REPLACE INTO local_meta (key, value, updated_at) VALUES (?,?,datetime('now'))`,
        ["sync:last_success_at", String(result.finishedAt)],
      );
    }
  } catch {
    /* ignore */
  }
}
