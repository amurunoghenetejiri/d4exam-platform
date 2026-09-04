/**
 * Server-side student exam notifications (service role — bypasses RLS).
 * Used when officer approves/schedules an examination so every enrolled student
 * receives Notification 20.0 copy + push action labels.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import * as Msg from "@/lib/notify-messages";

function adminClient() {
  const url =
    process.env["SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    "";
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SECRET_KEY"] ||
    process.env["SUPABASE_SERVICE_KEY"] ||
    process.env["SB_SERVICE_ROLE_KEY"] ||
    "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveCourseStudentAuthIds(
  sb: NonNullable<ReturnType<typeof adminClient>>,
  courseId: string | null | undefined,
  schoolId: string,
): Promise<string[]> {
  const sids: string[] = [];
  if (courseId) {
    const { data: sc } = await sb
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
      const { data: enroll } = await sb
        .from("course_enrollments")
        .select("student_id")
        .eq("course_id", courseId)
        .limit(3000);
      for (const r of enroll ?? []) {
        const id = (r as { student_id?: string }).student_id;
        if (id) sids.push(id);
      }
    }
  }
  if (sids.length) {
    const { data: students } = await sb
      .from("students")
      .select("id, profile_id, profiles(auth_user_id)")
      .in("id", [...new Set(sids)]);
    const auth: string[] = [];
    for (const s of students ?? []) {
      const aid = (s as { profiles?: { auth_user_id?: string | null } | null }).profiles
        ?.auth_user_id;
      if (aid) auth.push(aid);
    }
    if (auth.length) return [...new Set(auth)];
  }
  const { data: roles } = await sb
    .from("user_roles")
    .select("user_id")
    .eq("school_id", schoolId)
    .eq("role", "student")
    .limit(3000);
  return [...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))];
}

async function displayNames(
  sb: NonNullable<ReturnType<typeof adminClient>>,
  authIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!authIds.length) return map;
  const { data } = await sb.from("profiles").select("auth_user_id, full_name").in("auth_user_id", authIds);
  for (const row of data ?? []) {
    const r = row as { auth_user_id?: string | null; full_name?: string | null };
    if (r.auth_user_id) map.set(r.auth_user_id, (r.full_name || "").trim() || "Student");
  }
  return map;
}

export const serverNotifyStudentsExamApproved = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const o = (data && typeof data === "object" && "data" in (data as object)
      ? (data as { data: Record<string, unknown> }).data
      : data) as Record<string, unknown>;
    return {
      schoolId: String(o.schoolId || ""),
      examId: String(o.examId || ""),
      examTitle: String(o.examTitle || "Examination"),
      courseId: o.courseId != null ? String(o.courseId) : null,
      courseCode: o.courseCode != null ? String(o.courseCode) : null,
      courseTitle: o.courseTitle != null ? String(o.courseTitle) : null,
      start: o.start != null ? String(o.start) : null,
      end: o.end != null ? String(o.end) : null,
    };
  })
  .handler(async ({ data }) => {
    if (!data.schoolId || !data.examId) {
      return { ok: false as const, sent: 0, reason: "missing fields" };
    }
    const sb = adminClient();
    if (!sb) return { ok: false as const, sent: 0, reason: "no admin client" };

    let courseCode = data.courseCode;
    let courseTitle = data.courseTitle;
    if (data.courseId && (!courseCode || !courseTitle)) {
      const { data: c } = await sb
        .from("courses")
        .select("code, name")
        .eq("id", data.courseId)
        .maybeSingle();
      const row = c as { code?: string; name?: string } | null;
      if (row) {
        courseCode = courseCode || row.code || null;
        courseTitle = courseTitle || row.name || null;
      }
    }

    const authIds = await resolveCourseStudentAuthIds(sb, data.courseId, data.schoolId);
    if (!authIds.length) {
      return { ok: false as const, sent: 0, reason: "no students" };
    }
    const names = await displayNames(sb, authIds);
    const link = "/student/examinations";
    let sent = 0;

    for (const uid of authIds) {
      const studentName = names.get(uid) || "Student";
      const copy = Msg.studentExamScheduled({
        studentName,
        examTitle: data.examTitle,
        courseCode,
        courseTitle,
        start: data.start,
        end: data.end,
        link,
      });
      const actionLabel = copy.action?.label || "VIEW EXAM";

      // Dedupe 30 min
      const since = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data: existing } = await sb
        .from("notifications")
        .select("id")
        .eq("recipient_user_id", uid)
        .eq("type", "exam_scheduled")
        .eq("entity_id", data.examId)
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      if (existing?.id) continue;

      const { error } = await sb.from("notifications").insert({
        recipient_user_id: uid,
        school_id: data.schoolId,
        title: copy.title,
        message: copy.message,
        type: "exam_scheduled",
        link,
        action_url: link,
        entity_type: "examination",
        entity_id: data.examId,
      } as never);
      if (error) {
        console.warn("[serverNotifyStudentsExamApproved] insert", error.message);
        continue;
      }
      sent += 1;
      try {
        const { dispatchPushToUser } = await import("@/lib/push-send.functions");
        await dispatchPushToUser({
          data: {
            recipientUserId: uid,
            title: copy.title,
            message: copy.message,
            link,
            actionLabel,
          },
        });
      } catch (e) {
        console.warn("[serverNotifyStudentsExamApproved] push", e);
      }
    }
    return { ok: true as const, sent, total: authIds.length };
  });
