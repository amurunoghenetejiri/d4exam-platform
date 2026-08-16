/**
 * D4EXAM notification helpers — DB-backed inserts with light dedupe.
 * Columns used: recipient_user_id, school_id, title, message, type, read_at,
 * optional link / action_url / entity_type / entity_id when present in schema.
 */
import { supabase } from "@/integrations/supabase/client";

export type NotifyType =
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
  | "system_alert";

export type NotifyPayload = {
  recipientUserId: string;
  schoolId?: string | null;
  title: string;
  message: string;
  type?: NotifyType | string;
  /** Path inside the app, e.g. /officer/approvals */
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Skip insert if same recipient+entity+type was created in the last N minutes */
  dedupeMinutes?: number;
};

function baseRow(p: NotifyPayload) {
  const row: Record<string, unknown> = {
    recipient_user_id: p.recipientUserId,
    title: p.title,
    message: p.message,
    type: p.type || "info",
  };
  if (p.schoolId) row.school_id = p.schoolId;
  if (p.link) {
    row.link = p.link;
    row.action_url = p.link;
  }
  if (p.entityType) row.entity_type = p.entityType;
  if (p.entityId) row.entity_id = p.entityId;
  return row;
}

/** Insert one notification. Never throws to callers — logs and returns null on failure. */
export async function notifyUser(p: NotifyPayload): Promise<string | null> {
  if (!p.recipientUserId) return null;
  try {
    if (p.dedupeMinutes && p.entityId) {
      const since = new Date(Date.now() - p.dedupeMinutes * 60_000).toISOString();
      let q = supabase
        .from("notifications")
        .select("id")
        .eq("recipient_user_id", p.recipientUserId)
        .eq("type", p.type || "info")
        .gte("created_at", since)
        .limit(1);
      // entity_id may not exist on older schemas — ignore filter errors by soft try
      if (p.entityId) q = q.eq("entity_id" as never, p.entityId as never);
      const { data: existing } = await q.maybeSingle();
      if (existing?.id) return existing.id as string;
    }

    const row = baseRow(p);
    const { data, error } = await supabase.from("notifications").insert(row as never).select("id").maybeSingle();
    if (error) {
      // Retry without optional columns if schema is minimal
      const minimal = {
        recipient_user_id: p.recipientUserId,
        title: p.title,
        message: p.message,
        type: p.type || "info",
        ...(p.schoolId ? { school_id: p.schoolId } : {}),
      };
      const { data: d2, error: e2 } = await supabase
        .from("notifications")
        .insert(minimal as never)
        .select("id")
        .maybeSingle();
      if (e2) {
        console.warn("[notify] insert failed:", error.message, e2.message);
        return null;
      }
      return (d2?.id as string) ?? null;
    }
    return (data?.id as string) ?? null;
  } catch (e) {
    console.warn("[notify] error:", e);
    return null;
  }
}

export async function notifyMany(payloads: NotifyPayload[]): Promise<void> {
  await Promise.all(payloads.map((p) => notifyUser(p)));
}

/** All examination officers for a school (auth user ids). */
export async function listOfficerUserIds(schoolId: string): Promise<string[]> {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "examination_officer");
    const ids = (roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean);
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

/** School admins for a school. */
export async function listAdminUserIds(schoolId: string): Promise<string[]> {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .in("role", ["school_admin", "admin"]);
    return [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
  } catch {
    return [];
  }
}

/** Notify every examination officer that a teacher submitted an exam for review. */
export async function notifyOfficersExamSubmitted(opts: {
  schoolId: string;
  teacherName: string;
  examId: string;
  examTitle: string;
  courseLabel?: string;
}) {
  const officers = await listOfficerUserIds(opts.schoolId);
  const label = opts.courseLabel ? `${opts.courseLabel} — ${opts.examTitle}` : opts.examTitle;
  await notifyMany(
    officers.map((id) => ({
      recipientUserId: id,
      schoolId: opts.schoolId,
      title: "Exam submitted for review",
      message: `${opts.teacherName} submitted ${label} for examination review.`,
      type: "exam_submitted",
      link: "/officer/approvals",
      entityType: "examination",
      entityId: opts.examId,
      dedupeMinutes: 30,
    })),
  );
}

/** Notify teacher after officer decision. */
export async function notifyTeacherExamDecision(opts: {
  teacherUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
  decision: "approve" | "reject" | "changes";
  scheduleNote?: string;
  comment?: string;
}) {
  const titles = {
    approve: "Examination approved",
    reject: "Examination rejected",
    changes: "Revision requested",
  } as const;
  const types = {
    approve: "exam_approved",
    reject: "exam_rejected",
    changes: "exam_revision_requested",
  } as const;
  let message =
    opts.decision === "approve"
      ? `Your examination “${opts.examTitle}” was approved.`
      : opts.decision === "reject"
        ? `Your examination “${opts.examTitle}” was rejected.`
        : `Changes were requested on “${opts.examTitle}”.`;
  if (opts.scheduleNote) message += ` ${opts.scheduleNote}`;
  if (opts.comment) message += ` Message: ${opts.comment}`;

  await notifyUser({
    recipientUserId: opts.teacherUserId,
    schoolId: opts.schoolId,
    title: titles[opts.decision],
    message,
    type: types[opts.decision],
    link: `/teacher/examinations`,
    entityType: "examination",
    entityId: opts.examId,
    dedupeMinutes: 5,
  });
}

/** Notify student that result is published. */
export async function notifyStudentResultPublished(opts: {
  studentUserId: string;
  schoolId?: string | null;
  resultId: string;
  examTitle: string;
}) {
  await notifyUser({
    recipientUserId: opts.studentUserId,
    schoolId: opts.schoolId,
    title: "Result published",
    message: `Your result for ${opts.examTitle} is now available.`,
    type: "result_published",
    link: `/student/results/${opts.resultId}`,
    entityType: "result",
    entityId: opts.resultId,
    dedupeMinutes: 60,
  });
}

/** Notify student exam was submitted successfully. */
export async function notifyStudentExamSubmitted(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
}) {
  await notifyUser({
    recipientUserId: opts.studentUserId,
    schoolId: opts.schoolId,
    title: "Exam submitted successfully",
    message: `Your examination “${opts.examTitle}” has been submitted.`,
    type: "success",
    link: `/student/results`,
    entityType: "examination",
    entityId: opts.examId,
    dedupeMinutes: 10,
  });
}
