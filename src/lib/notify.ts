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

async function firePush(
  recipientUserId: string,
  title: string,
  message: string,
  link: string | null,
): Promise<void> {
  if (!recipientUserId) return;
  try {
    const m = await import("@/lib/push-send.functions");
    const result = await m.dispatchPushToUser({
      data: {
        recipientUserId,
        title,
        message,
        link: link || "/",
      },
    });
    const r = result as { sent?: number; skipped?: boolean; reason?: string };
    if (r?.skipped || (r?.sent ?? 0) === 0) {
      console.warn("[notify] push not delivered", recipientUserId, r?.reason || r);
    }
  } catch (e) {
    console.warn("[notify] firePush failed", e);
  }
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
    const { data: students, error } = await supabase
      .from("students")
      .select("id, profile_id, profiles(auth_user_id)")
      .in("id", studentIds);
    if (!error && students?.length) {
      const auth = [
        ...new Set(
          (students as { profiles?: { auth_user_id?: string | null } | null }[])
            .map((s) => s.profiles?.auth_user_id)
            .filter((x): x is string => Boolean(x)),
        ),
      ];
      if (auth.length) return auth;
    }
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
      await firePush(p.recipientUserId, p.title, p.message, p.link ?? null);
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
    if (data?.id) await firePush(p.recipientUserId, p.title, p.message, p.link ?? null);
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

async function authUserDisplayNames(authIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(authIds.filter(Boolean))];
  if (!uniq.length) return map;
  try {
    const { data } = await supabase.from("profiles").select("auth_user_id, full_name").in("auth_user_id", uniq);
    for (const row of data ?? []) {
      const r = row as { auth_user_id?: string | null; full_name?: string | null };
      if (r.auth_user_id) map.set(r.auth_user_id, (r.full_name || "").trim() || "Student");
    }
  } catch { /* ignore */ }
  return map;
}

function formatExamWhen(iso: string | null | undefined): { date: string; time: string; full: string } {
  if (!iso) return { date: "", time: "", full: "" };
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: "", time: "", full: "" };
    const date = d.toLocaleDateString(undefined, { dateStyle: "medium" });
    const time = d.toLocaleTimeString(undefined, { timeStyle: "short" });
    return { date, time, full: `${date} at ${time}` };
  } catch { return { date: "", time: "", full: "" }; }
}

async function courseStudentAuthIds(courseId: string | null | undefined, schoolId: string): Promise<string[]> {
  try {
    if (courseId) {
      const sids: string[] = [];
      const { data: sc } = await supabase
        .from("student_courses")
        .select("student_id")
        .eq("course_id", courseId)
        .eq("school_id", schoolId)
        .limit(3000);
      for (const r of sc ?? []) {
        const id = (r as { student_id?: string }).student_id;
        if (id) sids.push(id);
      }
      if (!sids.length) {
        const { data: enroll } = await supabase
          .from("course_enrollments")
          .select("student_id")
          .eq("course_id", courseId)
          .limit(3000);
        for (const r of enroll ?? []) {
          const id = (r as { student_id?: string }).student_id;
          if (id) sids.push(id);
        }
      }
      if (sids.length) return studentIdsToAuthUserIds([...new Set(sids)]);
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "student")
      .limit(3000);
    const fromRoles = [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
    if (fromRoles.length) return fromRoles;
    const { data: students } = await supabase
      .from("students")
      .select("id, profiles(auth_user_id)")
      .eq("school_id", schoolId)
      .limit(3000);
    const auth: string[] = [];
    for (const s of students ?? []) {
      const aid = (s as { profiles?: { auth_user_id?: string | null } | null }).profiles?.auth_user_id;
      if (aid) auth.push(aid);
    }
    if (auth.length) return [...new Set(auth)];
    return studentIdsToAuthUserIds((students ?? []).map((s) => (s as { id: string }).id).filter(Boolean));
  } catch (e) {
    console.warn("[notify] courseStudentAuthIds failed", e);
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
        title: "📊 Result Awaiting Review",
        message: `${name} submitted “${title}”. Review and release when ready.`,
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
          title: "🎓 Examination Submitted",
          message: `Your “${title}” has been successfully submitted.`,
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
      title: "🎉 Result Released",
      message: `Your result for “${opts.examTitle}” is now available.`,
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
        title: "🎉 Result Released",
        message: `Student, your ${opts.examTitle} result has been released. Tap below to view your result.`,
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
      title: "🎓 Examination Submitted",
      message: `Student, your ${opts.examTitle} examination has been submitted successfully.`,
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
  studentUserId?: string | null;
  studentId?: string | null;
  schoolId?: string | null;
  examId?: string | null;
  examTitle?: string | null;
  message?: string | null;
}): Promise<void> {
  try {
    let uid = (opts.studentUserId || "").trim();
    if (!uid && opts.studentId) {
      const ids = await studentIdsToAuthUserIds([opts.studentId]);
      uid = ids[0] || "";
    }
    if (!uid) {
      console.warn("[notify] notifyStudentOfficerWarning: no auth user", opts.studentId);
      return;
    }
    await notifyUser({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "⚠️ Officer Warning",
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
        title: "🔒 Result Held",
        message: `Your result for “${opts.examTitle}” has been held by the Officer.${reason}`,
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
        title: "📅 Examination Rescheduled",
        message: `“${opts.examTitle}” was rescheduled.${whenTxt}${reason}`,
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
        title: "📝 Rewrite Required",
        message: `You are required to rewrite “${opts.examTitle}”.${reason}`,
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
      title: "⚠️ Result Terminated",
      message: `Your result for “${opts.examTitle}” has been terminated.${reason}`,
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
        title: "📝 Examination Submitted for Approval",
        message: `${opts.teacherName ? opts.teacherName + " has submitted" : "A teacher submitted"} “${opts.examTitle}”${course} for approval.`,
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
  let title = "✅ Examination Approved";
  let type: NotifyType = "exam_approved";
  let message = `Your “${opts.examTitle}” has been approved.`;
  if (d.includes("reject")) {
    title = "❌ Examination Rejected";
    type = "exam_rejected";
    message = `Your “${opts.examTitle}” was rejected.${note ? ` ${note}` : ""}`;
  } else if (d.includes("revision") || d.includes("change")) {
    title = "⚠️ Correction Required";
    type = "exam_revision_requested";
    message = `Your “${opts.examTitle}” requires correction.${note ? ` ${note}` : ""}`;
  } else if (opts.scheduleNote) {
    message = `Your “${opts.examTitle}” has been approved. ${opts.scheduleNote}`;
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
          title: type === "exam_approved" ? "✅ Examination Approved" : "❌ Examination Rejected",
          message: `“${opts.examTitle}” was ${type === "exam_approved" ? "approved" : "rejected"}.`,
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
    const startLabel = opts.scheduledStart
      ? new Date(opts.scheduledStart).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "";
    const when = startLabel
      ? ` It is scheduled for ${startLabel}.`
      : "";
    await notifyMany(
      authIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "🎓 Examination Approved",
        message: `Your “${opts.examTitle}” examination has been approved and is ready.${when} Open Examinations to prepare or start when it is time.`,
        type: "exam_scheduled",
        link: `/student/exam/${opts.examId}`,
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
      title: "🚀 Examination Available",
      message: `“${opts.examTitle}” is available for you to take.`,
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
        title: "🏫 New School Application",
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
        title: "👨‍🎓 Students Added",
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
        title: "👨‍🏫 Teachers Added",
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
        title: "🎓 Examination Completed",
        message: `${school} has completed “${opts.examTitle}”.${counts}`,
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
        title: "🎓 Examination Completed",
        message: `“${opts.examTitle}” has been completed.${counts}`,
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

export async function notifyStudentsNewMaterial(opts: {
  schoolId: string;
  courseId?: string | null;
  courseName?: string;
  materialType?: string;
  title?: string;
}): Promise<void> {
  try {
    const authIds = await courseStudentAuthIds(opts.courseId ?? null, opts.schoolId);
    if (!authIds.length) return;
    const course = opts.courseName?.trim() || "your course";
    const kind = opts.materialType?.trim() || "material";
    const label = opts.title?.trim() ? ` “${opts.title.trim()}”` : "";
    await notifyMany(
      authIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "📚 New Study Material",
        message: `New ${kind}${label} has been uploaded for ${course}.`,
        type: "announcement",
        link: "/student/materials",
        entityType: "course_material",
        entityId: opts.courseId || opts.schoolId,
        dedupeMinutes: 5,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsNewMaterial failed", e);
  }
}


export async function notifyStudentExamTerminated(opts: {
  studentUserId?: string | null;
  studentId?: string | null;
  schoolId?: string | null;
  examId?: string | null;
  examTitle?: string | null;
  reason?: string | null;
}): Promise<void> {
  try {
    let uid = (opts.studentUserId || "").trim();
    if (!uid && opts.studentId) {
      const ids = await studentIdsToAuthUserIds([opts.studentId]);
      uid = ids[0] || "";
    }
    if (!uid) return;
    const title = opts.examTitle?.trim() || "your examination";
    const why = opts.reason?.trim()
      ? ` ${opts.reason.trim()}`
      : " because a configured examination security rule was triggered.";
    await notifyUser({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "🚫 Examination Terminated",
      message: `Your “${title}” examination has been terminated${why}`,
      type: "exam_terminated",
      link: "/student/examinations",
      entityType: "examination",
      entityId: opts.examId ?? null,
      dedupeMinutes: 30,
    });
  } catch (e) {
    console.warn("[notify] notifyStudentExamTerminated failed", e);
  }
}

export async function notifyStudentExamAutoSubmitted(opts: {
  studentUserId?: string | null;
  studentId?: string | null;
  schoolId?: string | null;
  examId?: string | null;
  examTitle?: string | null;
}): Promise<void> {
  try {
    let uid = (opts.studentUserId || "").trim();
    if (!uid && opts.studentId) {
      const ids = await studentIdsToAuthUserIds([opts.studentId]);
      uid = ids[0] || "";
    }
    if (!uid) return;
    const title = opts.examTitle?.trim() || "your examination";
    await notifyUser({
      recipientUserId: uid,
      schoolId: opts.schoolId,
      title: "⚠️ Examination Auto-Submitted",
      message: `Your “${title}” examination was automatically submitted because the maximum allowed tab violations were reached.`,
      type: "exam_submitted",
      link: "/student/results",
      entityType: "examination",
      entityId: opts.examId ?? null,
      dedupeMinutes: 30,
    });
  } catch (e) {
    console.warn("[notify] notifyStudentExamAutoSubmitted failed", e);
  }
}


export async function notifyStudentExamReminder(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
  studentName?: string | null;
  kind: "24h" | "30m" | "10m" | "start";
}): Promise<void> {
  try {
    const names = await authUserDisplayNames([opts.studentUserId]);
    const name = (opts.studentName || names.get(opts.studentUserId) || "Student").trim();
    let title = "⏰ Examination Reminder";
    let message = "";
    let type: NotifyType = "exam_scheduled";
    if (opts.kind === "24h") {
      title = "📚 Examination Tomorrow";
      message = `${name}, your ${opts.examTitle} examination is scheduled for tomorrow. Be prepared.`;
    } else if (opts.kind === "30m") {
      message = `${name}, your ${opts.examTitle} examination starts in 30 minutes. Be ready!`;
    } else if (opts.kind === "10m") {
      message = `${name}, your ${opts.examTitle} examination starts in 10 minutes. Get ready!`;
    } else {
      title = "🚀 Examination Starts Now";
      message = `${name}, your ${opts.examTitle} examination starts now. Tap below to start.`;
      type = "exam_available";
    }
    await notifyUser({
      recipientUserId: opts.studentUserId,
      schoolId: opts.schoolId,
      title,
      message,
      type,
      link: `/student/exam/${opts.examId}`,
      entityType: `exam_reminder_${opts.kind}`,
      entityId: opts.examId,
      dedupeMinutes: opts.kind === "start" ? 45 : opts.kind === "10m" ? 20 : opts.kind === "30m" ? 40 : 12 * 60,
    });
  } catch (e) {
    console.warn("[notify] notifyStudentExamReminder failed", e);
  }
}

export async function notifyOfficersStudentViolation(opts: {
  schoolId: string;
  examId?: string | null;
  examTitle?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  eventType: string;
  description?: string | null;
  severity?: string | null;
}): Promise<void> {
  try {
    const sev = String(opts.severity || "medium").toLowerCase();
    if (sev === "low") return;
    const officers = await listOfficerUserIds(opts.schoolId);
    if (!officers.length) return;
    const who =
      (opts.studentName || "").trim() ||
      (opts.studentId ? await studentDisplayName(opts.studentId) : "A student");
    const exam = (opts.examTitle || "an examination").trim();
    const et = String(opts.eventType || "VIOLATION").replace(/_/g, " ");
    const detail = (opts.description || "").trim();
    await notifyMany(
      officers.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "⚠️ Examination Security Alert",
        message: `${who} triggered ${et} during ${exam}.${detail ? ` ${detail}` : ""} Tap to open live monitoring.`,
        type: "warning",
        link: "/officer/live-monitor",
        entityType: "integrity_event",
        entityId: `${opts.examId || "x"}:${opts.studentId || "s"}:${opts.eventType}`,
        dedupeMinutes: 3,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyOfficersStudentViolation failed", e);
  }
}

export async function processDueExamReminders(schoolId?: string | null): Promise<{ sent: number }> {
  let sent = 0;
  try {
    const now = Date.now();
    let q = supabase
      .from("examinations")
      .select("id, title, school_id, scheduled_start, status, course_id")
      .in("status", ["approved", "scheduled", "published", "ongoing"])
      .not("scheduled_start", "is", null)
      .limit(80);
    if (schoolId) q = q.eq("school_id", schoolId);
    const { data: exams, error } = await q;
    if (error || !exams?.length) return { sent: 0 };
    for (const raw of exams) {
      const exam = raw as { id: string; title: string; school_id: string; scheduled_start: string; course_id?: string | null };
      const startMs = new Date(exam.scheduled_start).getTime();
      if (Number.isNaN(startMs)) continue;
      const delta = startMs - now;
      let kind: "24h" | "30m" | "10m" | "start" | null = null;
      if (delta >= 23.5 * 3600_000 && delta <= 24.5 * 3600_000) kind = "24h";
      else if (delta >= 26 * 60_000 && delta <= 34 * 60_000) kind = "30m";
      else if (delta >= 7 * 60_000 && delta <= 13 * 60_000) kind = "10m";
      else if (delta >= -2 * 60_000 && delta <= 2 * 60_000) kind = "start";
      if (!kind) continue;
      const authIds = await courseStudentAuthIds(exam.course_id ?? null, exam.school_id);
      const names = await authUserDisplayNames(authIds);
      for (const uid of authIds) {
        await notifyStudentExamReminder({
          studentUserId: uid,
          schoolId: exam.school_id,
          examId: exam.id,
          examTitle: exam.title,
          studentName: names.get(uid),
          kind,
        });
        sent += 1;
      }
    }
  } catch (e) {
    console.warn("[notify] processDueExamReminders failed", e);
  }
  return { sent };
}

export async function processWeeklyAggregationSummaries(schoolId?: string | null): Promise<void> {
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const schoolsQ = schoolId
      ? await supabase.from("schools").select("id, name").eq("id", schoolId)
      : await supabase.from("schools").select("id, name").limit(40);
    const schools = (schoolsQ.data ?? []) as { id: string; name: string }[];
    for (const school of schools) {
      const [{ count: studentCount }, { count: examCount }, { count: violationCount }] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", school.id).gte("created_at", since),
        supabase.from("examinations").select("id", { count: "exact", head: true }).eq("school_id", school.id).gte("created_at", since),
        supabase.from("integrity_events").select("id", { count: "exact", head: true }).eq("school_id", school.id).gte("created_at", since),
      ]);
      const admins = await listAdminUserIds(school.id);
      const weekKey = new Date().toISOString().slice(0, 10);
      const payloads: Parameters<typeof notifyMany>[0] = [];
      if ((studentCount ?? 0) > 0) {
        for (const uid of admins) {
          payloads.push({
            recipientUserId: uid, schoolId: school.id,
            title: "👥 Weekly Enrollment Summary",
            message: `${school.name}: ${studentCount} students were enrolled this week.`,
            type: "info", link: "/admin/students", entityType: "weekly_enrollment", entityId: `${school.id}:${weekKey}`, dedupeMinutes: 6 * 24 * 60,
          });
        }
      }
      if ((examCount ?? 0) > 0) {
        for (const uid of admins) {
          payloads.push({
            recipientUserId: uid, schoolId: school.id,
            title: "📊 Weekly Examination Summary",
            message: `${school.name}: ${examCount} examinations were created this week.`,
            type: "info", link: "/admin/examinations", entityType: "weekly_exams", entityId: `${school.id}:${weekKey}`, dedupeMinutes: 6 * 24 * 60,
          });
        }
      }
      if ((violationCount ?? 0) > 0) {
        for (const uid of admins) {
          payloads.push({
            recipientUserId: uid, schoolId: school.id,
            title: "🛡️ Weekly Security Summary",
            message: `${school.name}: ${violationCount} examination security violations were recorded this week.`,
            type: "warning", link: "/admin", entityType: "weekly_security", entityId: `${school.id}:${weekKey}`, dedupeMinutes: 6 * 24 * 60,
          });
        }
      }
      if (payloads.length) await notifyMany(payloads);
    }
  } catch (e) {
    console.warn("[notify] processWeeklyAggregationSummaries failed", e);
  }
}
