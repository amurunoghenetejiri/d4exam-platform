/**
 * Outbox push — upload safe local operations to Supabase.
 * Idempotent via outbox id / client_mutation_id.
 * Does NOT push exam answers, results, or integrity events (Step 4).
 */
import { supabase } from "@/integrations/supabase/client";
import { listPendingOutbox, markOutboxStatus } from "@/lib/local-db/repositories/outboxRepo";
import type { OutboxRow } from "@/lib/local-db/types";
import { isPermanentError, shouldRetryOutbox } from "./retry";

const ALLOWED_ENTITY_TYPES = new Set([
  "notification_read",
  "notification_read_all",
  "local_preference",
]);

export type PushSummary = {
  pushed: number;
  failed: number;
  skipped: number;
  errors: string[];
};

async function processOne(row: OutboxRow): Promise<"ok" | "fail" | "skip"> {
  if (!ALLOWED_ENTITY_TYPES.has(row.entity_type)) {
    await markOutboxStatus(row.id, "failed", `entity not allowed offline: ${row.entity_type}`);
    return "skip";
  }

  if (!shouldRetryOutbox(row.attempts ?? 0, row.last_error)) {
    return "skip";
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json || "{}") as Record<string, unknown>;
  } catch {
    await markOutboxStatus(row.id, "failed", "invalid payload_json");
    return "fail";
  }

  try {
    if (row.entity_type === "notification_read") {
      const id = String(row.entity_id || payload.id || "");
      if (!id) {
        await markOutboxStatus(row.id, "failed", "missing notification id");
        return "fail";
      }
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: (payload.read_at as string) || new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      await markOutboxStatus(row.id, "sent");
      return "ok";
    }

    if (row.entity_type === "notification_read_all") {
      const userId = String(payload.user_id || "");
      if (!userId) {
        await markOutboxStatus(row.id, "failed", "missing user_id");
        return "fail";
      }
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_user_id", userId)
        .is("read_at", null);
      if (error && /column|recipient/i.test(error.message)) {
        const { error: e2 } = await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", userId)
          .is("read_at", null);
        if (e2) throw new Error(e2.message);
      } else if (error) {
        throw new Error(error.message);
      }
      await markOutboxStatus(row.id, "sent");
      return "ok";
    }

    if (row.entity_type === "local_preference") {
      await markOutboxStatus(row.id, "sent");
      return "ok";
    }

    await markOutboxStatus(row.id, "failed", "unhandled entity");
    return "skip";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markOutboxStatus(row.id, "failed", msg);
    return "fail";
  }
}

export async function pushOutbox(limit = 40): Promise<PushSummary> {
  const pending = await listPendingOutbox(limit);
  const summary: PushSummary = { pushed: 0, failed: 0, skipped: 0, errors: [] };

  for (const row of pending) {
    const r = await processOne(row);
    if (r === "ok") summary.pushed += 1;
    else if (r === "fail") {
      summary.failed += 1;
      if (row.last_error) summary.errors.push(row.last_error);
    } else summary.skipped += 1;
  }

  return summary;
}
