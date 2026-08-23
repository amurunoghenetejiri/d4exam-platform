/**
 * Centralized notification service for D4EXAM.
 * In-app (DB) + phone push. Role helpers live in notify.ts; this module is the public API.
 * Do not scatter ad-hoc inserts — call these functions.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  notifyUser,
  notifyMany,
  listOfficerUserIds,
  listAdminUserIds,
  listTeacherUserIds,
  type NotifyPayload,
  type NotifyType,
} from "@/lib/notify";
import { dispatchPushToUser } from "@/lib/push-send.functions";
import {
  loadNotificationPrefs,
  isNotificationTypeAllowed,
  type NotificationPrefs,
} from "@/lib/notification-prefs";

export type { NotifyPayload, NotifyType };

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export async function createNotification(p: NotifyPayload): Promise<string | null> {
  return notifyUser(p);
}

export async function sendPushNotification(opts: {
  recipientUserId: string;
  title: string;
  message: string;
  link?: string | null;
}): Promise<{ sent: number; failed: number; skipped?: boolean; reason?: string }> {
  try {
    const r = await dispatchPushToUser({
      data: {
        recipientUserId: opts.recipientUserId,
        title: opts.title,
        message: opts.message,
        link: opts.link || "/",
      },
    });
    return r as { sent: number; failed: number; skipped?: boolean; reason?: string };
  } catch (e) {
    return { sent: 0, failed: 1, skipped: true, reason: (e as Error).message };
  }
}

/** In-app + push for one user (respects local prefs when available on client). */
export async function notifyUserWithPrefs(
  p: NotifyPayload,
  prefs?: NotificationPrefs | null,
): Promise<string | null> {
  const resolved =
    prefs ??
    (typeof window !== "undefined" && p.recipientUserId
      ? loadNotificationPrefs(p.recipientUserId)
      : null);
  if (resolved && !isNotificationTypeAllowed(p.type, resolved)) {
    return null;
  }
  return notifyUser(p);
}

export async function notifyRoleInSchool(opts: {
  schoolId: string;
  role: "examination_officer" | "school_admin" | "teacher" | "student";
  title: string;
  message: string;
  type?: NotifyType | string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeMinutes?: number;
}): Promise<void> {
  let ids: string[] = [];
  if (opts.role === "examination_officer") ids = await listOfficerUserIds(opts.schoolId);
  else if (opts.role === "school_admin") ids = await listAdminUserIds(opts.schoolId);
  else if (opts.role === "teacher") ids = await listTeacherUserIds(opts.schoolId);
  else {
    const { data } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", opts.schoolId)
      .eq("role", "student");
    ids = [...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
  }
  await notifyMany(
    ids.map((uid) => ({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: opts.title,
      message: opts.message,
      type: opts.type || "info",
      link: opts.link,
      entityType: opts.entityType,
      entityId: opts.entityId,
      dedupeMinutes: opts.dedupeMinutes,
    })),
  );
}

export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .eq("id", notificationId)
    .eq("recipient_user_id", userId);
  return !error;
}

export async function markAllAsRead(userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .eq("recipient_user_id", userId)
    .is("read_at", null);
  return !error;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", userId)
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

export async function dismissNotification(notificationId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("recipient_user_id", userId);
  return !error;
}

/** Re-export role exam helpers so call sites can import from one module. */
export {
  notifyOfficersExamSubmitted,
  notifyTeacherExamDecision,
  notifyStudentsExamApproved,
  notifyStudentExamAvailable,
  notifyStudentExamSubmitted,
  notifyStudentResultPublished,
  notifyStudentsResultsReleased,
  notifyOfficersStudentResultPending,
  notifyStudentsExamRescheduled,
  notifyStudentsRewriteAllowed,
  notifyStudentOfficerWarning,
  notifyStudentResultTerminated,
  listOfficerUserIds,
  listAdminUserIds,
  listTeacherUserIds,
  studentIdsToAuthUserIds,
  notifyUser,
  notifyMany,
} from "@/lib/notify";
