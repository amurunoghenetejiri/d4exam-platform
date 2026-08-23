import { supabase } from "@/integrations/supabase/client";

export type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "exam_submitted"
  | "exam_approved"
  | "exam_rejected"
  | "exam_revision_requested"
  | "exam_scheduled"
  | "exam_available"
  | "result_published"
  | "announcement"
  | "system_alert"
  | string;

export type SendNotificationInput = {
  /** Must be auth.users.id (auth.uid()), NEVER profiles.id */
  recipientUserId: string;
  title: string;
  message: string;
  type?: NotificationType;
  schoolId?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export async function sendNotification(
  input: SendNotificationInput,
): Promise<{ id: string | null; error: string | null }> {
  const recipient = input.recipientUserId?.trim();
  if (!recipient) return { id: null, error: "recipient required" };

  const title = (input.title || "Notification").trim() || "Notification";
  const message = input.message ?? "";
  const type = (input.type || "info").trim() || "info";
  const schoolId = input.schoolId ?? null;
  const link = input.link ?? null;

  try {
    const { data, error } = await supabase.rpc("insert_notification" as never, {
      _recipient: recipient,
      _title: title,
      _message: message,
      _type: type,
      _school_id: schoolId,
      _link: link,
      _entity_type: input.entityType ?? null,
      _entity_id: input.entityId != null ? String(input.entityId) : null,
    } as never);

    if (!error && data) {
      return { id: String(data), error: null };
    }
    if (error && !/function|does not exist|42883/i.test(error.message)) {
      console.warn("[notify] rpc", error.message);
    }
  } catch (e) {
    console.warn("[notify] rpc failed", e);
  }

  const { data: row, error: insErr } = await supabase
    .from("notifications")
    .insert({
      recipient_user_id: recipient,
      school_id: schoolId,
      title,
      message,
      type,
      link,
      action_url: link,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId != null ? String(input.entityId) : null,
    } as never)
    .select("id")
    .maybeSingle();

  if (insErr) {
    console.error("[notify] insert", insErr.message);
    return { id: null, error: insErr.message };
  }
  return { id: (row as { id?: string } | null)?.id ?? null, error: null };
}

export async function sendNotifications(
  recipients: string[],
  payload: Omit<SendNotificationInput, "recipientUserId">,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const unique = [...new Set(recipients.filter(Boolean))];
  for (const uid of unique) {
    const r = await sendNotification({ ...payload, recipientUserId: uid });
    if (r.id) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

export async function userIdsForRoleInSchool(
  schoolId: string,
  role: "school_admin" | "examination_officer" | "teacher" | "student" | "super_admin",
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("school_id", schoolId)
    .eq("role", role);
  if (error) {
    console.warn("[notify] roles", error.message);
    return [];
  }
  return [...new Set((data ?? []).map((r) => r.user_id as string).filter(Boolean))];
}
