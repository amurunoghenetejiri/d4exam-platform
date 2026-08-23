/**
 * D4EXAM notification helpers — DB-backed inserts + push.
 * recipient_user_id MUST be auth.users id (auth.uid()), never profiles.id.
 *
 * ROOT CAUSE FIXES:
 * - Call sites often pass student table ids as studentIds; helpers now resolve to auth ids.
 * - Missing examTitle/studentName is resolved from DB when possible.
 * - Every successful insert fires dispatchPushToUser.
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
  | "officer_warning"
  | string;

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

function firePush(recipientUserId: string, title: string, message: string, link: string | null) {
  void import("@/lib/push-send.functions")
    .then((m) =>
      m.dispatchPushToUser({
        data: {
          recipientUserId,
          title,
          message,
          link: link || "/",
        },
      }),
    )
    .catch(() => undefined);
}

export async function resolveAuthUserIds(
  ids: string[],
  schoolId?: string | null,
): Promise<string[]> {
  const uniq = (xs: (string | null | undefined)[]) =>
    [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const input = uniq(ids);
  if (!input.length) return [];
  try {
    let q1 = supabase.from("profiles").select("auth_user_id").in("auth_user_id", input);
    if (schoolId) q1 = q1.eq("school_id", schoolId);
    const { data: byAuth } = await q1;
    const matched = uniq((byAuth ?? []).map((p) => (p as { auth_user_id: string | null }).auth_user_id));
    const missing = input.filter((id) => !matched.includes(id));
    if (!missing.length) return matched.length ? matched : input;
    let q2 = supabase.from("profiles").select("auth_user_id").in("id", missing);
    if (schoolId) q2 = q2.eq("school_id", schoolId);
    const { data: byProfile } = await q2;
    const via = uniq((byProfile ?? []).map((p) => (p as { auth_user_id: string | null }).auth_user_id));
    return uniq([...matched, ...via]);
  } catch {
    return input;
  }
}

export async function studentIdsToAuthUserIds(studentIds: string[]): Promise<string[]> {
  if (!studentIds.length) return [];
  try {
    const { data: students } = await supabase
      .from("students")
      .select("id, profile_id, auth_user_id")
      .in("id", studentIds);
    const direct = (students ?? [])
      .map((s) => (s as { auth_user_id?: string | null }).auth_user_id)
      .filter(Boolean) as string[];
    if (direct.length) return [...new Set(direct)];
    const profileIds = [...new Set((students ?? []).map((s) => s.profile_id).filter(Boolean))] as string[];
    if (!profileIds.length) return resolveAuthUserIds(studentIds);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, auth_user_id")
      .in("id", profileIds);
    const fromProfiles = [...new Set((profiles ?? []).map((p) => (p as { auth_user_id?: string | null }).auth_user_id).filter(Boolean) as string[])];
    if (fromProfiles.length) return fromProfiles;
    return resolveAuthUserIds(studentIds);
  } catch {
    return resolveAuthUserIds(studentIds);
  }
}

async function resolveStudentAuthIds(opts: {
  schoolId?: string | null;
  studentAuthUserIds?: string[] | null;
  studentIds?: string[] | null;
}): Promise<string[]> {
  const fromAuth = [...new Set((opts.studentAuthUserIds ?? []).filter(Boolean))];
  const fromStudents = await studentIdsToAuthUserIds([...(opts.studentIds ?? [])].filter(Boolean));
  const merged = [...new Set([...fromAuth, ...fromStudents])];
  if (!merged.length) return [];
  return resolveAuthUserIds(merged, opts.schoolId);
}

export async function notifyUser(p: NotifyPayload): Promise<string | null> {
  if (!p.recipientUserId) return null;
  try {
    const resolved = await resolveAuthUserIds([p.recipientUserId], p.schoolId);
    p = { ...p, recipientUserId: resolved[0] || p.recipientUserId };

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

    if (!rpcErr && rpcId) {
      firePush(p.recipientUserId, p.title, p.message, p.link ?? null);
      return String(rpcId);
    }

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
    if (p.entityId) row.entity_id = String(p.entityId);

    const { data, error } = await supabase.from("notifications").insert(row as never).select("id").maybeSingle();
    if (error) {
      console.warn("[notify] insert failed", error.message);
      return null;
    }
    if (data?.id) firePush(p.recipientUserId, p.title, p.message, p.link ?? null);
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
    const { data: bySchool } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "examination_officer");
    const ids = uniq((bySchool ?? []).map((r) => (r as { user_id: string }).user_id));
    if (ids.length) {
      const resolved = await resolveAuthUserIds(ids, schoolId);
      return resolved.length ? resolved : ids;
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
    const ids = [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
    if (!ids.length) return [];
    const resolved = await resolveAuthUserIds(ids, schoolId);
    return resolved.length ? resolved : ids;
  } catch {
    return [];
  }
}

export async function listTeacherUserIds(schoolId: string): Promise<string[]> {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "teacher");
    const fromRoles = [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
    if (fromRoles.length) {
      const resolved = await resolveAuthUserIds(fromRoles, schoolId);
      return resolved.length ? resolved : fromRoles;
    }
    return [];
  } catch {
    return [];
  }
}

export async function listSuperAdminUserIds(): Promise<string[]> {
  try {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
    return [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
  } catch {
    return [];
  }
}

async function schoolNameById(schoolId: string | null | undefined): Promise<string> {
  if (!schoolId) return "A school";
  try {
    const { data } = await supabase.from("schools").select("name").eq("id", schoolId).maybeSingle();
    return (data as { name?: string } | null)?.name || "A school";
  } catch {
    return "A school";
  }
}

async function examTitleById(examId: string | null | undefined): Promise<string> {
  if (!examId) return "Examination";
  try {
    const { data } = await supabase.from("examinations").select("title").eq("id", examId).maybeSingle();
    return (data as { title?: string } | null)?.title || "Examination";
  } catch {
    return "Examination";
  }
}

async function studentDisplayName(studentId: string | null | undefined): Promise<string> {
  if (!studentId) return "A student";
  try {
    const { data: st } = await supabase
      .from("students")
      .select("matric_number, profiles(full_name)")
      .eq("id", studentId)
      .maybeSingle();
    const name = (st as { profiles?: { full_name?: string } | null } | null)?.profiles?.full_name;
    const matric = (st as { matric_number?: string } | null)?.matric_number;
    return name || matric || "A student";
  } catch {
    return "A student";
  }
}

async function courseStudentAuthIds(courseId: string | null | undefined, schoolId: string): Promise<string[]> {
  if (!courseId) {
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .eq("role", "student")
        .limit(2000);
      return [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
    } catch {
      return [];
    }
  }
  try {
    const { data: enroll } = await supabase
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", courseId)
      .limit(2000);
    const sids = [...new Set((enroll ?? []).map((r) => (r as { student_id: string }).student_id))];
    return studentIdsToAuthUserIds(sids);
  } catch {
    return [];
  }
}

export async function notifyOfficersStudentResultPending(opts: {
  schoolId: string;
  examId: string;
  examTitle?: string;
  studentName?: string;
  studentId?: string | null;
  resultId?: string | null;
  published?: boolean;
}): Promise<void> {
  try {
    if (opts.published) return;
    const officers = await listOfficerUserIds(opts.schoolId);
    const admins = await listAdminUserIds(opts.schoolId);
    const title = opts.examTitle || (await examTitleById(opts.examId));
    const name = opts.studentName || (await studentDisplayName(opts.studentId));
    await notifyMany(
      [...new Set([...officers, ...admins])].map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "\ud83d\udcca Result Awaiting Review",
        message: `${name} submitted \u201c${title}\u201d. Review and release when ready.`,
        type: "result_pending_release",
        link: officers.includes(uid) ? "/officer/results" : "/admin/results",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 30,
      })),
    );
    if (opts.studentId) {
      const authIds = await studentIdsToAuthUserIds([opts.studentId]);
      for (const uid of authIds) {
        await notifyUser({
          recipientUserId: uid,
          schoolId: opts.schoolId,
          title: "\ud83c\udf93 Examination Submitted",
          message: `Your \u201c${title}\u201d has been successfully submitted.`,
          type: "exam_submitted",
          link: "/student/results",
          entityType: "examination",
          entityId: opts.examId,
          dedupeMinutes: 60,
        });
      }
    }
  } catch (e) {
    console.warn("[notify] notifyOfficersStudentResultPending failed", e);
  }
}

export async function notifyStudentResultPublished(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
}): Promise<void> {
  try {
    await notifyUser({
      recipientUserId: opts.studentUserId,
      schoolId: opts.schoolId,
      title: "\ud83c\udf89 Result Released",
      message: `Your result for \u201c${opts.examTitle}\u201d is now available.`,
      type: "result_published",
      link: "/student/results",
      entityType: "examination",
      entityId: opts.examId,
    });
  } catch (e) {
    console.warn("[notify] notifyStudentResultPublished failed", e);
  }
}

export async function notifyStudentsResultsReleased(opts: {
  schoolId: string;
  examId?: string;
  examTitle: string;
  studentAuthUserIds?: string[];
  studentIds?: string[];
}): Promise<void> {
  try {
    const authIds = await resolveStudentAuthIds(opts);
    const examId = opts.examId || "released";
    await notifyMany(
      authIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "\ud83c\udf89 Result Released",
        message: `Results for \u201c${opts.examTitle}\u201d have been released.`,
        type: "result_published",
        link: "/student/results",
        entityType: "examination",
        entityId: examId,
        dedupeMinutes: 30,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsResultsReleased failed", e);
  }
}

export async function notifyStudentExamSubmitted(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
}): Promise<void> {
  try {
    await notifyUser({
      recipientUserId: opts.studentUserId,
      schoolId: opts.schoolId,
      title: "\ud83c\udf93 Examination Submitted",
      message: `Your submission for \u201c${opts.examTitle}\u201d was received.`,
      type: "exam_submitted",
      link: "/student/results",
      entityType: "examination",
      entityId: opts.examId,
    });
  } catch (e) {
    console.warn("[notify] notifyStudentExamSubmitted failed", e);
  }
}

export async function notifyStudentOfficerWarning(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId?: string | null;
  message?: string | null;
}): Promise<void> {
  try {
    await notifyUser({
      recipientUserId: opts.studentUserId,
      schoolId: opts.schoolId,
      title: "\u26a0\ufe0f Officer Warning",
      message: opts.message?.trim() || "An examination officer sent you a warning during your exam. Stay focused.",
      type: "officer_warning",
      link: "/student/examinations",
      entityType: opts.examId ? "examination" : null,
      entityId: opts.examId ?? null,
    });
  } catch (e) {
    console.warn("[notify] notifyStudentOfficerWarning failed", e);
  }
}

export async function notifyStudentsResultsHeld(opts: {
  schoolId: string;
  examId?: string;
  examTitle: string;
  studentAuthUserIds?: string[];
  studentIds?: string[];
  reason?: string | null;
}): Promise<void> {
  try {
    const authIds = await resolveStudentAuthIds(opts);
    const reason = opts.reason?.trim() ? ` Reason: ${opts.reason.trim()}` : "";
    await notifyMany(
      authIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "\ud83d\udd12 Result Held",
        message: `Your result for \u201c${opts.examTitle}\u201d has been held by the Officer.${reason}`,
        type: "result_pending_release",
        link: "/student/results",
        entityType: "examination",
        entityId: opts.examId || "held",
        dedupeMinutes: 30,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsResultsHeld failed", e);
  }
}

export async function notifyStudentsExamRescheduled(opts: {
  schoolId: string;
  examId?: string;
  examTitle: string;
  studentAuthUserIds?: string[];
  studentIds?: string[];
  whenLabel?: string | null;
  windowLabel?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    const authIds = await resolveStudentAuthIds(opts);
    const when = opts.whenLabel || opts.windowLabel;
    const whenTxt = when ? ` New time: ${when}.` : "";
    const reason = opts.reason?.trim() ? ` ${opts.reason.trim()}` : "";
    await notifyMany(
      authIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "\ud83d\udcc5 Examination Rescheduled",
        message: `\u201c${opts.examTitle}\u201d was rescheduled.${whenTxt}${reason}`,
        type: "exam_scheduled",
        link: "/student/examinations",
        entityType: "examination",
        entityId: opts.examId || "rescheduled",
        dedupeMinutes: 30,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsExamRescheduled failed", e);
  }
}

export async function notifyStudentsRewriteAllowed(opts: {
  schoolId: string;
  examId?: string;
  examTitle: string;
  studentAuthUserIds?: string[];
  studentIds?: string[];
  reason?: string | null;
}): Promise<void> {
  try {
    const authIds = await resolveStudentAuthIds(opts);
    const reason = opts.reason?.trim() ? ` Reason: ${opts.reason.trim()}` : "";
    await notifyMany(
      authIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "\ud83d\udcdd Rewrite Required",
        message: `You are required to rewrite \u201c${opts.examTitle}\u201d.${reason}`,
        type: "exam_available",
        link: "/student/examinations",
        entityType: "examination",
        entityId: opts.examId || "rewrite",
        dedupeMinutes: 30,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsRewriteAllowed failed", e);
  }
}

export async function notifyStudentResultTerminated(opts: {
  studentUserId?: string;
  studentId?: string;
  schoolId?: string | null;
  examId?: string;
  examTitle: string;
  reason?: string | null;
}): Promise<void> {
  try {
    let uid = opts.studentUserId;
    if (!uid && opts.studentId) {
      const ids = await studentIdsToAuthUserIds([opts.studentId]);
      uid = ids[0];
    }
    if (!uid) return;
    const reason = opts.reason?.trim() ? ` Reason: ${opts.reason.trim()}` : "";
    await notifyUser({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "\u26a0\ufe0f Result Terminated",
      message: `Your result for \u201c${opts.examTitle}\u201d has been terminated.${reason}`,
      type: "warning",
      link: "/student/results",
      entityType: "examination",
      entityId: opts.examId || null,
    });
  } catch (e) {
    console.warn("[notify] notifyStudentResultTerminated failed", e);
  }
}

export async function notifyOfficersExamSubmitted(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  teacherName?: string | null;
  courseLabel?: string | null;
}): Promise<void> {
  try {
    const [officers, admins] = await Promise.all([
      listOfficerUserIds(opts.schoolId),
      listAdminUserIds(opts.schoolId),
    ]);
    const recipients = [...new Set([...officers, ...admins])];
    const who = opts.teacherName ? ` by ${opts.teacherName}` : "";
    const course = opts.courseLabel ? ` (${opts.courseLabel})` : "";
    await notifyMany(
      recipients.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "\ud83d\udcdd Examination Submitted",
        message: `\u201c${opts.examTitle}\u201d${course} was submitted${who} for approval.`,
        type: "exam_submitted",
        link: officers.includes(uid) ? "/officer/approvals" : "/admin/examinations",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 10,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyOfficersExamSubmitted failed", e);
  }
}

export async function notifyTeacherExamDecision(opts: {
  teacherUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
  decision: string;
  note?: string | null;
  comment?: string | null;
  scheduleNote?: string | null;
}): Promise<void> {
  const d = String(opts.decision || "").toLowerCase();
  const note = (opts.note || opts.comment || "").trim();
  let title = "\u2705 Examination Approved";
  let type: NotifyType = "exam_approved";
  let message = `Your \u201c${opts.examTitle}\u201d has been approved.`;
  if (d.includes("reject")) {
    title = "\u274c Examination Rejected";
    type = "exam_rejected";
    message = `Your \u201c${opts.examTitle}\u201d was rejected.${note ? ` ${note}` : ""}`;
  } else if (d.includes("revision") || d.includes("change")) {
    title = "\u26a0\ufe0f Correction Required";
    type = "exam_revision_requested";
    message = `Your \u201c${opts.examTitle}\u201d requires correction.${note ? ` ${note}` : ""}`;
  } else if (opts.scheduleNote) {
    message = `Your \u201c${opts.examTitle}\u201d has been approved. ${opts.scheduleNote}`;
  }
  try {
    await notifyUser({
      recipientUserId: opts.teacherUserId,
      schoolId: opts.schoolId,
      title,
      message,
      type,
      link: "/teacher/examinations",
      entityType: "examination",
      entityId: opts.examId,
    });
    if (opts.schoolId && (type === "exam_approved" || type === "exam_rejected")) {
      const admins = await listAdminUserIds(opts.schoolId);
      await notifyMany(
        admins.map((uid) => ({
          recipientUserId: uid,
          schoolId: opts.schoolId,
          title: type === "exam_approved" ? "\u2705 Examination Approved" : "\u274c Examination Rejected",
          message: `\u201c${opts.examTitle}\u201d was ${type === "exam_approved" ? "approved" : "rejected"}.`,
          type,
          link: "/admin/examinations",
          entityType: "examination",
          entityId: opts.examId,
          dedupeMinutes: 10,
        })),
      );
    }
  } catch (e) {
    console.warn("[notify] notifyTeacherExamDecision failed", e);
  }
}

export async function notifyStudentsExamApproved(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  studentAuthUserIds?: string[];
  studentIds?: string[];
  courseId?: string | null;
  scheduledStart?: string | null;
}): Promise<void> {
  try {
    let authIds = await resolveStudentAuthIds(opts);
    if (!authIds.length && opts.courseId) authIds = await courseStudentAuthIds(opts.courseId, opts.schoolId);
    if (!authIds.length) authIds = await courseStudentAuthIds(null, opts.schoolId);
    const when = opts.scheduledStart
      ? ` Scheduled to start ${new Date(opts.scheduledStart).toLocaleString()}.`
      : "";
    await notifyMany(
      authIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "\ud83d\udcda Examination Scheduled",
        message: `\u201c${opts.examTitle}\u201d has been approved.${when}`,
        type: "exam_scheduled",
        link: "/student/examinations",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 60,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsExamApproved failed", e);
  }
}

export async function notifyStudentExamAvailable(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
}): Promise<void> {
  try {
    await notifyUser({
      recipientUserId: opts.studentUserId,
      schoolId: opts.schoolId,
      title: "\ud83d\ude80 Examination Available",
      message: `\u201c${opts.examTitle}\u201d is available for you to take.`,
      type: "exam_available",
      link: "/student/examinations",
      entityType: "examination",
      entityId: opts.examId,
      dedupeMinutes: 120,
    });
  } catch (e) {
    console.warn("[notify] notifyStudentExamAvailable failed", e);
  }
}

export async function notifySuperAdminsOfApplication(opts: {
  schoolName: string;
  applicationId: string;
  trackingCode?: string;
}): Promise<void> {
  try {
    const ids = await listSuperAdminUserIds();
    const ref = opts.trackingCode || opts.applicationId.slice(0, 8);
    await notifyMany(
      ids.map((uid) => ({
        recipientUserId: uid,
        title: "\ud83c\udfeb New School Application",
        message: `${opts.schoolName} has submitted a new school application (ref ${ref}).`,
        type: "system_alert",
        link: "/super-admin/applications",
        entityType: "school_application",
        entityId: opts.applicationId,
        dedupeMinutes: 5,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifySuperAdminsOfApplication failed", e);
  }
}

export async function notifySuperAdminsStudentsAdded(opts: {
  schoolId: string;
  count: number;
  schoolName?: string;
}): Promise<void> {
  try {
    if (opts.count < 1) return;
    const name = opts.schoolName || (await schoolNameById(opts.schoolId));
    const ids = await listSuperAdminUserIds();
    await notifyMany(
      ids.map((uid) => ({
        recipientUserId: uid,
        title: "\ud83d\udc68\u200d\ud83c\udf93 Students Added",
        message: `${name} added ${opts.count} new student(s).`,
        type: "system_alert",
        link: "/super-admin/schools",
        entityType: "school",
        entityId: opts.schoolId,
        dedupeMinutes: 5,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifySuperAdminsStudentsAdded failed", e);
  }
}

export async function notifySuperAdminsTeachersAdded(opts: {
  schoolId: string;
  count: number;
  schoolName?: string;
}): Promise<void> {
  try {
    if (opts.count < 1) return;
    const name = opts.schoolName || (await schoolNameById(opts.schoolId));
    const ids = await listSuperAdminUserIds();
    await notifyMany(
      ids.map((uid) => ({
        recipientUserId: uid,
        title: "\ud83d\udc68\u200d\ud83c\udfeb Teachers Added",
        message: `${name} added ${opts.count} new teacher(s).`,
        type: "system_alert",
        link: "/super-admin/schools",
        entityType: "school",
        entityId: opts.schoolId,
        dedupeMinutes: 5,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifySuperAdminsTeachersAdded failed", e);
  }
}

export async function notifyExamCompleted(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  submittedCount?: number;
  totalCount?: number;
}): Promise<void> {
  try {
    const school = await schoolNameById(opts.schoolId);
    const counts =
      opts.submittedCount != null && opts.totalCount != null
        ? ` ${opts.submittedCount}/${opts.totalCount} students submitted.`
        : "";
    const supers = await listSuperAdminUserIds();
    const officers = await listOfficerUserIds(opts.schoolId);
    const admins = await listAdminUserIds(opts.schoolId);
    await notifyMany(
      supers.map((uid) => ({
        recipientUserId: uid,
        title: "\ud83c\udf93 Examination Completed",
        message: `${school} has completed \u201c${opts.examTitle}\u201d.${counts}`,
        type: "system_alert",
        link: "/super-admin/examinations",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 120,
      })),
    );
    await notifyMany(
      [...new Set([...officers, ...admins])].map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "\ud83c\udf93 Examination Completed",
        message: `\u201c${opts.examTitle}\u201d has been completed.${counts}`,
        type: "exam_submitted",
        link: officers.includes(uid) ? "/officer/results" : "/admin/results",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 120,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyExamCompleted failed", e);
  }
}
