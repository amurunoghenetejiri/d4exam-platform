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

/** Ensure ids are auth.users ids. Accepts auth ids or profile ids. */
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
      void import("@/lib/push-send.functions")
        .then((m) =>
          m.dispatchPushToUser({
            data: {
              recipientUserId: p.recipientUserId,
              title: p.title,
              message: p.message,
              link: p.link || "/",
            },
          }),
        )
        .catch(() => undefined);
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
    if (data?.id) {
      void import("@/lib/push-send.functions")
        .then((m) =>
          m.dispatchPushToUser({
            data: {
              recipientUserId: p.recipientUserId,
              title: p.title,
              message: p.message,
              link: p.link || "/",
            },
          }),
        )
        .catch(() => undefined);
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
      if (ids.length) {
        try {
          const resolved = await resolveAuthUserIds(ids, schoolId);
          if (resolved.length) return resolved;
        } catch { /* ignore */ }
        return ids;
      }
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
    const ids = [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
    if (!ids.length) return [];
    try {
      const resolved = await resolveAuthUserIds(ids, schoolId);
      if (resolved.length) return resolved;
    } catch { /* ignore */ }
    return ids;
  } catch {
    return [];
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
    if (!profileIds.length) return [];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, auth_user_id")
      .in("id", profileIds);
    return [...new Set((profiles ?? []).map((p) => (p as { auth_user_id?: string | null }).auth_user_id).filter(Boolean) as string[])];
  } catch {
    return [];
  }
}

/** Resolve teacher auth user ids for a school. */
export async function listTeacherUserIds(schoolId: string): Promise<string[]> {
  try {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "teacher");
    const fromRoles = [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
    if (fromRoles.length) {
      try {
        const resolved = await resolveAuthUserIds(fromRoles, schoolId);
        if (resolved.length) return resolved;
      } catch { /* ignore */ }
      return fromRoles;
    }
    const { data: teachers } = await supabase
      .from("teachers")
      .select("profile_id, auth_user_id")
      .eq("school_id", schoolId);
    const direct = (teachers ?? [])
      .map((t) => (t as { auth_user_id?: string | null }).auth_user_id)
      .filter(Boolean) as string[];
    if (direct.length) return [...new Set(direct)];
    const profileIds = [...new Set((teachers ?? []).map((t) => (t as { profile_id?: string | null }).profile_id).filter(Boolean))] as string[];
    if (!profileIds.length) return [];
    const { data: profiles } = await supabase.from("profiles").select("auth_user_id").in("id", profileIds);
    return [...new Set((profiles ?? []).map((p) => (p as { auth_user_id?: string | null }).auth_user_id).filter(Boolean) as string[])];
  } catch {
    return [];
  }
}

export async function notifyOfficersStudentResultPending(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  studentName: string;
}): Promise<void> {
  try {
    const officers = await listOfficerUserIds(opts.schoolId);
    await notifyMany(
      officers.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "Result pending release",
        message: `${opts.studentName} submitted “${opts.examTitle}”. Review and release when ready.`,
        type: "result_pending_release",
        link: "/officer/results",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 30,
      })),
    );
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
      title: "Result published",
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
  examId: string;
  examTitle: string;
  studentAuthUserIds: string[];
}): Promise<void> {
  try {
    await notifyMany(
      opts.studentAuthUserIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "Results released",
        message: `Results for “${opts.examTitle}” have been released.`,
        type: "result_published",
        link: "/student/results",
        entityType: "examination",
        entityId: opts.examId,
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
      title: "Exam submitted",
      message: `Your submission for “${opts.examTitle}” was received.`,
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
      title: "Officer warning",
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
  examId: string;
  examTitle: string;
  studentAuthUserIds: string[];
}): Promise<void> {
  try {
    await notifyMany(
      opts.studentAuthUserIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "Results held",
        message: `Results for “${opts.examTitle}” are held pending review.`,
        type: "result_pending_release",
        link: "/student/results",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 30,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsResultsHeld failed", e);
  }
}

export async function notifyStudentsExamRescheduled(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  studentAuthUserIds: string[];
  whenLabel?: string | null;
}): Promise<void> {
  try {
    const when = opts.whenLabel ? ` New time: ${opts.whenLabel}.` : "";
    await notifyMany(
      opts.studentAuthUserIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "Exam rescheduled",
        message: `“${opts.examTitle}” was rescheduled.${when}`,
        type: "exam_scheduled",
        link: "/student/examinations",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 30,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsExamRescheduled failed", e);
  }
}

export async function notifyStudentsRewriteAllowed(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  studentAuthUserIds: string[];
}): Promise<void> {
  try {
    await notifyMany(
      opts.studentAuthUserIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "Rewrite allowed",
        message: `You may rewrite “${opts.examTitle}”. Open Examinations when ready.`,
        type: "exam_available",
        link: "/student/examinations",
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 30,
      })),
    );
  } catch (e) {
    console.warn("[notify] notifyStudentsRewriteAllowed failed", e);
  }
}

export async function notifyStudentResultTerminated(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
}): Promise<void> {
  try {
    await notifyUser({
      recipientUserId: opts.studentUserId,
      schoolId: opts.schoolId,
      title: "Result terminated",
      message: `Your attempt for “${opts.examTitle}” was terminated by an officer.`,
      type: "warning",
      link: "/student/results",
      entityType: "examination",
      entityId: opts.examId,
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
}): Promise<void> {
  try {
    const [officers, admins] = await Promise.all([
      listOfficerUserIds(opts.schoolId),
      listAdminUserIds(opts.schoolId),
    ]);
    const recipients = [...new Set([...officers, ...admins])];
    const who = opts.teacherName ? ` by ${opts.teacherName}` : "";
    await notifyMany(
      recipients.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "Exam submitted for approval",
        message: `“${opts.examTitle}” was submitted${who}. Review in Approvals.`,
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
  decision: "approved" | "rejected" | "revision";
  note?: string | null;
}): Promise<void> {
  const map = {
    approved: {
      title: "Examination approved",
      type: "exam_approved",
      message: `“${opts.examTitle}” was approved.`,
    },
    rejected: {
      title: "Examination rejected",
      type: "exam_rejected",
      message: `“${opts.examTitle}” was rejected.${opts.note ? ` ${opts.note}` : ""}`,
    },
    revision: {
      title: "Revision requested",
      type: "exam_revision_requested",
      message: `Revision requested for “${opts.examTitle}”.${opts.note ? ` ${opts.note}` : ""}`,
    },
  } as const;
  const m = map[opts.decision];
  try {
    await notifyUser({
      recipientUserId: opts.teacherUserId,
      schoolId: opts.schoolId,
      title: m.title,
      message: m.message,
      type: m.type,
      link: "/teacher/examinations",
      entityType: "examination",
      entityId: opts.examId,
    });
  } catch (e) {
    console.warn("[notify] notifyTeacherExamDecision failed", e);
  }
}

export async function notifyStudentsExamApproved(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  studentAuthUserIds: string[];
}): Promise<void> {
  try {
    await notifyMany(
      opts.studentAuthUserIds.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: "Exam approved",
        message: `“${opts.examTitle}” has been approved and may appear in your exam list when scheduled.`,
        type: "exam_approved",
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
      title: "Exam available",
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
