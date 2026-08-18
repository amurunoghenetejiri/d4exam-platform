/**
 * D4EXAM notification helpers — DB-backed inserts with light dedupe.
 * recipient_user_id MUST be auth.users id (auth.uid()), never profiles.id.
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
  | "result_pending_release"
  | "announcement"
  | "system_alert"
  | "officer_warning";

export type NotifyPayload = {
  recipientUserId: string;
  schoolId?: string | null;
  title: string;
  message: string;
  type?: NotifyType | string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeMinutes?: number;
};

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
      if (p.entityId) q = q.eq("entity_id" as never, p.entityId as never);
      const { data: existing } = await q.maybeSingle();
      if (existing?.id) return existing.id as string;
    }

    const { data: rpcId, error: rpcErr } = await supabase.rpc("insert_notification" as never, {
      _recipient: p.recipientUserId,
      _title: p.title,
      _message: p.message,
      _type: p.type || "info",
      _school_id: p.schoolId ?? null,
      _link: p.link ?? null,
      _entity_type: p.entityType ?? null,
      _entity_id: p.entityId ?? null,
    } as never);

    if (!rpcErr && rpcId) return String(rpcId);

    const row: Record<string, unknown> = {
      recipient_user_id: p.recipientUserId,
      title: p.title,
      message: p.message,
      type: p.type || "info",
    };
    if (p.schoolId) row.school_id = p.schoolId;
    if (p.link) row.link = p.link;
    if (p.entityType) row.entity_type = p.entityType;
    if (p.entityId) row.entity_id = p.entityId;

    const { data, error } = await supabase.from("notifications").insert(row as never).select("id").maybeSingle();
    if (error) {
      console.warn("[notify] insert failed", error.message);
      return null;
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

export async function listOfficerUserIds(schoolId: string): Promise<string[]> {
  const uniq = (ids: (string | null | undefined)[]) =>
    [...new Set(ids.filter((x): x is string => Boolean(x)))];
  try {
    const { data: bySchool, error: e1 } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "examination_officer");
    if (!e1) {
      const ids = uniq((bySchool ?? []).map((r) => (r as { user_id: string }).user_id));
      if (ids.length) return ids;
    }
    const { data: allOfficers } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "examination_officer");
    const candidates = uniq((allOfficers ?? []).map((r) => (r as { user_id: string }).user_id));
    if (candidates.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("auth_user_id")
        .eq("school_id", schoolId)
        .in("auth_user_id", candidates);
      const ids = uniq((profiles ?? []).map((p) => (p as { auth_user_id: string | null }).auth_user_id));
      if (ids.length) return ids;
    }
    const { data: officerRows } = await supabase.from("examination_officers").select("profile_id").limit(500);
    const profileIds = uniq((officerRows ?? []).map((o) => (o as { profile_id: string | null }).profile_id));
    if (profileIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("auth_user_id")
        .eq("school_id", schoolId)
        .in("id", profileIds);
      const ids = uniq((profiles ?? []).map((p) => (p as { auth_user_id: string | null }).auth_user_id));
      if (ids.length) return ids;
    }
    return [];
  } catch {
    return [];
  }
}

export async function listAdminUserIds(schoolId: string): Promise<string[]> {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "school_admin");
    return [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
  } catch {
    return [];
  }
}

export async function studentIdsToAuthUserIds(studentIds: string[]): Promise<string[]> {
  if (!studentIds.length) return [];
  try {
    const { data: students } = await supabase.from("students").select("id, profile_id").in("id", studentIds);
    const profileIds = [...new Set((students ?? []).map((s) => s.profile_id).filter(Boolean))] as string[];
    if (!profileIds.length) return [];
    const { data: profiles } = await supabase.from("profiles").select("id, auth_user_id").in("id", profileIds);
    const fromAuth = (profiles ?? []).map((p) => p.auth_user_id).filter(Boolean) as string[];
    if (fromAuth.length) return [...new Set(fromAuth)];
    return [...new Set(profileIds)];
  } catch {
    return [];
  }
}

export async function notifyOfficersStudentResultPending(opts: {
  schoolId: string;
  examId: string;
  studentId: string;
  resultId?: string | null;
  published?: boolean;
}) {
  if (opts.published) return;
  const officers = await listOfficerUserIds(opts.schoolId);
  if (!officers.length) return;
  await notifyMany(
    officers.map((uid) => ({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "Result waiting for release",
      message: "A student submitted an exam. Result is held pending officer approval or release.",
      type: "result_pending_release",
      link: "/officer/results",
      entityType: "examination",
      entityId: opts.examId,
      dedupeMinutes: 5,
    })),
  );
}

export async function notifyStudentResultPublished(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examTitle: string;
  resultId?: string | null;
}) {
  await notifyUser({
    recipientUserId: opts.studentUserId,
    schoolId: opts.schoolId,
    title: "Result published",
    message: `Your result for ${opts.examTitle} is now available.`,
    type: "result_published",
    link: "/student/results",
    entityType: "result",
    entityId: opts.resultId ?? null,
    dedupeMinutes: 60,
  });
}

export async function notifyStudentsResultsReleased(opts: {
  schoolId: string;
  studentIds: string[];
  examTitle: string;
  resultIdsByStudent?: Record<string, string>;
}) {
  const authIds = await studentIdsToAuthUserIds(opts.studentIds);
  await notifyMany(
    authIds.map((uid) => ({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "Result published",
      message: `Your result for ${opts.examTitle} is now available. Open My Results to view it.`,
      type: "result_published",
      link: "/student/results",
      entityType: "examination",
      dedupeMinutes: 60,
    })),
  );
}

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

export async function notifyStudentOfficerWarning(opts: {
  schoolId: string;
  studentId: string;
  examId: string;
  examTitle?: string;
  message?: string;
}) {
  const authIds = await studentIdsToAuthUserIds([opts.studentId]);
  const uid = authIds[0];
  if (!uid) {
    console.warn("[notify] no auth user for student warning", opts.studentId);
    return null;
  }
  const examBit = opts.examTitle ? ` during “${opts.examTitle}”` : "";
  return notifyUser({
    recipientUserId: uid,
    schoolId: opts.schoolId,
    title: "⚠ Officer warning",
    message:
      opts.message ||
      `An examination officer has issued a warning${examBit}. Stay focused on your exam and follow all rules. Further violations may be flagged.`,
    type: "officer_warning",
    link: "/student/examinations",
    entityType: "examination",
    entityId: opts.examId,
    dedupeMinutes: 30,
  });
}

export async function notifyStudentsResultsHeld(opts: {
  schoolId: string;
  studentIds: string[];
  examTitle: string;
  reason?: string;
}) {
  const authIds = await studentIdsToAuthUserIds(opts.studentIds);
  const reasonBit = opts.reason?.trim() ? ` Reason: ${opts.reason.trim()}` : "";
  await notifyMany(
    authIds.map((uid) => ({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "Result held for review",
      message: `Your result for “${opts.examTitle}” is held by the Examination Officer and is not yet released.${reasonBit}`,
      type: "warning",
      link: "/student/results",
      entityType: "examination",
      dedupeMinutes: 30,
    })),
  );
}

export async function notifyStudentsExamRescheduled(opts: {
  schoolId: string;
  studentIds: string[];
  examTitle: string;
  reason?: string;
  windowLabel?: string;
}) {
  const authIds = await studentIdsToAuthUserIds(opts.studentIds);
  const reasonBit = opts.reason?.trim() ? ` Reason: ${opts.reason.trim()}` : "";
  const windowBit = opts.windowLabel ? ` New window: ${opts.windowLabel}.` : "";
  await notifyMany(
    authIds.map((uid) => ({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "Exam rescheduled",
      message: `“${opts.examTitle}” has been rescheduled by the Examination Officer.${windowBit}${reasonBit}`,
      type: "exam_scheduled",
      link: "/student/examinations",
      entityType: "examination",
      dedupeMinutes: 30,
    })),
  );
}

export async function notifyStudentsRewriteAllowed(opts: {
  schoolId: string;
  studentIds: string[];
  examTitle: string;
  reason?: string;
}) {
  const authIds = await studentIdsToAuthUserIds(opts.studentIds);
  const reasonBit = opts.reason?.trim() ? ` Reason: ${opts.reason.trim()}` : "";
  await notifyMany(
    authIds.map((uid) => ({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "Rewrite allowed",
      message: `You may rewrite “${opts.examTitle}”. Open Examinations when the paper is available.${reasonBit}`,
      type: "exam_available",
      link: "/student/examinations",
      entityType: "examination",
      dedupeMinutes: 30,
    })),
  );
}

export async function notifyStudentResultTerminated(opts: {
  schoolId: string;
  studentId: string;
  examTitle: string;
  reason?: string;
}) {
  const authIds = await studentIdsToAuthUserIds([opts.studentId]);
  const uid = authIds[0];
  if (!uid) return null;
  const reasonBit = opts.reason?.trim() ? ` Reason: ${opts.reason.trim()}` : "";
  return notifyUser({
    recipientUserId: uid,
    schoolId: opts.schoolId,
    title: "Exam terminated",
    message: `Your attempt for “${opts.examTitle}” was terminated by the Examination Officer.${reasonBit}`,
    type: "error",
    link: "/student/results",
    entityType: "examination",
    dedupeMinutes: 10,
  });
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
  if (!officers.length) {
    console.warn("[notify] no examination officers found for school", opts.schoolId);
  }
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

/** Notify eligible students when officer approves / schedules an exam. */
export async function notifyStudentsExamApproved(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  courseId?: string | null;
  scheduledStart?: string | null;
}) {
  try {
    let studentIds: string[] = [];

    if (opts.courseId) {
      const { data: course } = await supabase
        .from("courses")
        .select("id, department_id, level_id")
        .eq("id", opts.courseId)
        .maybeSingle();

      let q = supabase
        .from("students")
        .select("id")
        .eq("school_id", opts.schoolId)
        .limit(2000);
      const dept = (course as { department_id?: string | null } | null)?.department_id;
      const level = (course as { level_id?: string | null } | null)?.level_id;
      if (dept) q = q.eq("department_id", dept);
      if (level) q = q.eq("level_id", level);
      const { data: students } = await q;
      studentIds = [...new Set((students ?? []).map((s) => (s as { id: string }).id).filter(Boolean))];
    }

    if (!studentIds.length) {
      const { data: students } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", opts.schoolId)
        .limit(500);
      studentIds = [...new Set((students ?? []).map((s) => (s as { id: string }).id).filter(Boolean))];
    }

    const authIds = await studentIdsToAuthUserIds(studentIds);
    if (!authIds.length) {
      console.warn("[notify] no student auth users for exam approval", opts.examId);
      return;
    }

    const when = opts.scheduledStart
      ? ` Starts ${new Date(opts.scheduledStart).toLocaleString()}.`
      : "";
    await notifyMany(
      authIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "Exam available",
        message: `“${opts.examTitle}” is now available for your programme.${when}`,
        type: "exam_available",
        link: "/student/examinations",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 120,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsExamApproved failed", e);
  }
}
