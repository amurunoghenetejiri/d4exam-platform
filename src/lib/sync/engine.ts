/**
 * D4EXAM sync engine orchestrator (Step 4).
 * Push outbox → pull scoped server changes. No UI. No offline CBT.
 */
import { resolveConnectivity } from "./connectivity";
import { pushOutbox } from "./push";
import { pullScopedData, type PullCtx } from "./pull";
import {
  setSyncPhase,
  setConnectivityOnSnapshot,
  recordSyncResult,
  refreshPendingCounts,
  getSyncSnapshot,
} from "./status";
import type { SyncRunResult, SyncEngineStatus } from "./types";
import { listPendingOutbox } from "@/lib/local-db/repositories/outboxRepo";
import { initLocalDb } from "@/lib/local-db/connection";

let running = false;
let lastRunAt = 0;
const MIN_GAP_MS = 10_000;

export type SyncEngineCtx = PullCtx & {
  queryClient?: { invalidateQueries: (opts?: unknown) => Promise<unknown> };
};

export async function runSyncEngine(ctx?: SyncEngineCtx | null): Promise<SyncRunResult> {
  const startedAt = Date.now();
  const empty = (status: SyncEngineStatus, connectivity: SyncRunResult["connectivity"]): SyncRunResult => ({
    status,
    startedAt,
    finishedAt: Date.now(),
    connectivity,
    pushed: 0,
    pulled: 0,
    failed: 0,
    conflicts: 0,
    pendingRemaining: 0,
    errors: [],
    scopes: {},
  });

  if (running) {
    return empty(getSyncSnapshot().status === "SYNCING" ? "SYNCING" : "IDLE", getSyncSnapshot().connectivity);
  }
  if (startedAt - lastRunAt < MIN_GAP_MS) {
    return empty("IDLE", getSyncSnapshot().connectivity);
  }

  running = true;
  setSyncPhase("probing", "SYNCING");

  try {
    await initLocalDb();
    const conn = await resolveConnectivity();
    setConnectivityOnSnapshot(conn.state, conn.internet);

    if (!conn.internet) {
      const result = empty("OFFLINE", conn.state);
      await recordSyncResult(result);
      return result;
    }

    if (!ctx?.userId) {
      const result = empty("SUCCESS", "online");
      result.scopes.USER_PROFILE = "skip";
      await recordSyncResult(result);
      return result;
    }

    setSyncPhase("pushing", "SYNCING");
    const push = await pushOutbox(40);

    setSyncPhase("pulling", "SYNCING");
    const pull = await pullScopedData({
      userId: ctx.userId,
      schoolId: ctx.schoolId,
      role: ctx.role,
      studentId: ctx.studentId,
      profileId: ctx.profileId,
    });

    if (ctx.queryClient) {
      try {
        await Promise.race([
          ctx.queryClient.invalidateQueries(),
          new Promise((r) => setTimeout(r, 10_000)),
        ]);
      } catch {
        /* ignore */
      }
    }

    const pending = await listPendingOutbox(200);
    const pendingRemaining = pending.filter((p) => p.status === "pending").length;

    let status: SyncEngineStatus = "SUCCESS";
    if (push.failed > 0 || pull.errors.length > 0) {
      status = push.pushed > 0 || pull.pulled > 0 ? "PARTIAL_SUCCESS" : "FAILED";
    }

    const result: SyncRunResult = {
      status,
      startedAt,
      finishedAt: Date.now(),
      connectivity: "online",
      pushed: push.pushed,
      pulled: pull.pulled,
      failed: push.failed + pull.errors.length,
      conflicts: 0,
      pendingRemaining,
      errors: [...push.errors, ...pull.errors].slice(0, 12),
      scopes: { ...pull.scopes, OUTBOX: push.failed ? "fail" : "ok" },
    };

    lastRunAt = Date.now();
    await recordSyncResult(result);
    await refreshPendingCounts();

    if (typeof console !== "undefined") {
      console.info(
        "[sync-engine]",
        result.status,
        `push=${result.pushed}`,
        `pull=${result.pulled}`,
        `fail=${result.failed}`,
        `pending=${result.pendingRemaining}`,
      );
    }

    return result;
  } catch (e) {
    const result = empty("FAILED", "unknown");
    result.errors = [e instanceof Error ? e.message : String(e)];
    await recordSyncResult(result);
    return result;
  } finally {
    running = false;
    setSyncPhase("idle");
  }
}

export function isSyncRunning(): boolean {
  return running;
}
