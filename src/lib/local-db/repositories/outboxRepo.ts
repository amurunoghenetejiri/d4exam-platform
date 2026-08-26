import { getLocalDb, initLocalDb } from "../connection";
import type { OutboxOperation, OutboxRow } from "../types";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ob_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueOutbox(input: {
  entityType: string;
  entityId?: string | null;
  operation: OutboxOperation;
  payload: unknown;
  id?: string;
}): Promise<string> {
  const db = getLocalDb() || (await initLocalDb());
  if (!db) throw new Error("local db unavailable");
  const id = input.id || newId();
  await db.execute(
    `INSERT OR REPLACE INTO local_outbox (
      id, entity_type, entity_id, operation, payload_json, status, attempts, last_error, created_at, updated_at, available_at
    ) VALUES (?,?,?,?,?,'pending',0,null,datetime('now'),datetime('now'),null)`,
    [
      id,
      input.entityType,
      input.entityId ?? null,
      input.operation,
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return id;
}

export async function listPendingOutbox(limit = 50): Promise<OutboxRow[]> {
  const db = getLocalDb() || (await initLocalDb());
  if (!db) return [];
  const res = await db.execute(
    `SELECT * FROM local_outbox WHERE status = ?`,
    ["pending"],
  );
  return (res.rows as OutboxRow[]).slice(0, limit);
}

export async function markOutboxStatus(
  id: string,
  status: "pending" | "sent" | "failed" | "conflict",
  lastError?: string | null,
): Promise<void> {
  const db = getLocalDb() || (await initLocalDb());
  if (!db) return;
  await db.execute(
    `UPDATE local_outbox SET status = ?, last_error = ?, attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`,
    [status, lastError ?? null, id],
  );
}

export async function setSyncCursor(
  entity: string,
  scopeKey: string,
  cursor: string | null,
): Promise<void> {
  const db = getLocalDb() || (await initLocalDb());
  if (!db) return;
  await db.execute(
    `INSERT OR REPLACE INTO local_sync_state (entity, scope_key, last_synced_at, cursor, updated_at)
     VALUES (?,?,datetime('now'),?,datetime('now'))`,
    [entity, scopeKey || "", cursor],
  );
}

export async function getSyncCursor(
  entity: string,
  scopeKey = "",
): Promise<{ last_synced_at: string | null; cursor: string | null } | null> {
  const db = getLocalDb() || (await initLocalDb());
  if (!db) return null;
  const res = await db.execute(
    `SELECT * FROM local_sync_state WHERE entity = ?`,
    [entity],
  );
  const row = res.rows.find((r) => String(r.scope_key ?? "") === scopeKey) || res.rows[0];
  if (!row) return null;
  return {
    last_synced_at: (row.last_synced_at as string) ?? null,
    cursor: (row.cursor as string) ?? null,
  };
}
