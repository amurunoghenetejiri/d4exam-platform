/**
 * Safe offline queue helpers — only non-sensitive operations.
 * Exam answers / results / integrity must NOT be queued here in Step 4.
 */
import { enqueueOutbox } from "@/lib/local-db/repositories/outboxRepo";
import { refreshPendingCounts } from "./status";

export async function queueNotificationRead(notificationId: string, readAt?: string): Promise<string> {
  const id = await enqueueOutbox({
    entityType: "notification_read",
    entityId: notificationId,
    operation: "update",
    payload: { id: notificationId, read_at: readAt || new Date().toISOString() },
    id: `notif_read_${notificationId}`,
  });
  void refreshPendingCounts();
  return id;
}

export async function queueNotificationReadAll(userId: string): Promise<string> {
  const id = await enqueueOutbox({
    entityType: "notification_read_all",
    entityId: userId,
    operation: "update",
    payload: { user_id: userId },
    id: `notif_read_all_${userId}_${new Date().toISOString().slice(0, 13)}`,
  });
  void refreshPendingCounts();
  return id;
}
