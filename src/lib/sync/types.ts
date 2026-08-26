/** Sync engine public types (Step 4). No UI coupling. */

export type SyncPhase =
  | "idle"
  | "probing"
  | "pushing"
  | "pulling"
  | "resolving"
  | "done"
  | "failed";

export type SyncEngineStatus =
  | "IDLE"
  | "SYNCING"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "OFFLINE"
  | "CONFLICT";

export type ConnectivityState =
  | "offline"
  | "network_no_internet"
  | "online"
  | "unknown";

export type ConflictPolicy =
  | "server_wins"
  | "local_wins"
  | "merge_notifications"
  | "mark_conflict"
  | "skip";

export type SyncScope =
  | "USER_PROFILE"
  | "NOTIFICATIONS"
  | "EXAMINATIONS_META"
  | "RESULTS"
  | "STUDENT_CONTEXT"
  | "OUTBOX";

export type SyncRunResult = {
  status: SyncEngineStatus;
  startedAt: number;
  finishedAt: number;
  connectivity: ConnectivityState;
  pushed: number;
  pulled: number;
  failed: number;
  conflicts: number;
  pendingRemaining: number;
  errors: string[];
  scopes: Partial<Record<SyncScope, "ok" | "skip" | "fail">>;
};

export type SyncSnapshot = {
  status: SyncEngineStatus;
  phase: SyncPhase;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  online: boolean;
  connectivity: ConnectivityState;
  lastResult: SyncRunResult | null;
};
