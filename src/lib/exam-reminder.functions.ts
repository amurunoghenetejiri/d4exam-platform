import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

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

/** Reminder windows in minutes before scheduled_start */
const WINDOWS: { minutes: number; label: string; title: string; type: string }[] = [
  { minutes: 24 * 60, label: "tomorrow", title: "Exam Tomorrow", type: "exam_reminder_24h" },
  { minutes: 60, label: "in 1 hour", title: "Exam Starting Soon", type: "exam_reminder_1h" },
  { minutes: 30, label: "in 30 minutes", title: "Exam Starting Soon", type: "exam_reminder_30m" },
  { minutes: 10, label: "in 10 minutes", title: "Get Ready", type: "exam_reminder_10m" },
  { minutes: 0, label: "now", title: "Exam Starting Now", type: "exam_reminder_now" },
];

const SLACK_MS = 90_000; // ±1.5 min window for cron ticks

async function insertNotif(
  sb: NonNullable<ReturnType<typeof adminClient>>,
  opts: {
    recipient: string;
    schoolId: string | null;
    title: string;
    message: string;
    type: string;
    link: string;
    entityId: string;
    dedupeKey: string;
  },
) {
  // Idempotency: same entity_id + type + recipient within long window
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await sb
    .from("notifications")
    .select("id")
    .eq("recipient_user_id", opts.recipient)
    .eq("type", opts.type)
    .eq("entity_id", opts.dedupeKey)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return false;

  const { error } = await sb.from("notifications").insert({
    recipient_user_id: opts.recipient,
    school_id: opts.schoolId,
    title: opts.title,
    message: opts.message,
    type: opts.type,
    link: opts.link,
    action_url: opts.link,
    entity_type: "examination",
    entity_id: opts.dedupeKey,
  } as never);
  if (error) return false;

  // Push (best-effort)
  try {
    const { dispatchPushToUser } = await import("@/lib/push-send.functions");
    await dispatchPushToUser({
      data: {
        recipientUserId: opts.recipient,
        title: opts.title,
        message: opts.message,
        link: opts.link,
      },
    });
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Scan scheduled exams and send due student reminders.
 * Call from a cron (Vercel cron / external) every 1–2 minutes.
 * Does NOT require the browser to stay open.
 */
export const processExamReminders = createServerFn({ method: "POST" }).handler(async () => {
  const sb = adminClient();
  if (!sb) return { ok: false as const, error: "no admin client", sent: 0 };

  const now = Date.now();
  const horizon = now + 25 * 60 * 60 * 1000; // next 25h

  const { data: exams, error } = await sb
    .from("examinations")
    .select("id, title, school_id, course_id, scheduled_start, status")
    .not("scheduled_start", "is", null)
    .in("status", ["approved", "scheduled", "published", "live", "active"])
    .gte("scheduled_start", new Date(now - 5 * 60_000).toISOString())
    .lte("scheduled_start", new Date(horizon).toISOString())
    .limit(200);

  if (error) return { ok: false as const, error: error.message, sent: 0 };

  let sent = 0;

  for (const exam of exams ?? []) {
    const startIso = (exam as { scheduled_start: string }).scheduled_start;
    const startMs = new Date(startIso).getTime();
    if (Number.isNaN(startMs)) continue;
    const examId = (exam as { id: string }).id;
    const title = (exam as { title: string }).title || "Examination";
    const schoolId = (exam as { school_id: string | null }).school_id;
    const courseId = (exam as { course_id: string | null }).course_id;

    // Students linked to course (or school-wide if no course)
    let studentAuthIds: string[] = [];
    if (courseId) {
      const { data: enroll } = await sb
        .from("course_enrollments")
        .select("student_id")
        .eq("course_id", courseId)
        .limit(2000);
      const sids = [...new Set((enroll ?? []).map((r) => (r as { student_id: string }).student_id))];
      if (sids.length) {
        const { data: students } = await sb
          .from("students")
          .select("auth_user_id, profile_id")
          .in("id", sids);
        const direct = (students ?? [])
          .map((s) => (s as { auth_user_id?: string | null }).auth_user_id)
          .filter(Boolean) as string[];
        if (direct.length) studentAuthIds = [...new Set(direct)];
        else {
          const pids = (students ?? [])
            .map((s) => (s as { profile_id?: string | null }).profile_id)
            .filter(Boolean) as string[];
          if (pids.length) {
            const { data: profiles } = await sb.from("profiles").select("auth_user_id").in("id", pids);
            studentAuthIds = [
              ...new Set(
                (profiles ?? [])
                  .map((p) => (p as { auth_user_id?: string | null }).auth_user_id)
                  .filter(Boolean) as string[],
              ),
            ];
          }
        }
      }
    }

    if (!studentAuthIds.length && schoolId) {
      const { data: roles } = await sb
        .from("user_roles")
        .select("user_id")
        .eq("school_id", schoolId)
        .eq("role", "student")
        .limit(500);
      studentAuthIds = [
        ...new Set((roles ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean)),
      ];
    }

    for (const win of WINDOWS) {
      const target = startMs - win.minutes * 60_000;
      if (Math.abs(now - target) > SLACK_MS) continue;

      for (const uid of studentAuthIds) {
        const dedupeKey = `${examId}:${win.type}`;
        const ok = await insertNotif(sb, {
          recipient: uid,
          schoolId,
          title: win.title,
          message:
            win.minutes === 0
              ? `“${title}” is now available. Open Examinations to start.`
              : `Your “${title}” examination begins ${win.label}.`,
          type: win.type,
          link: "/student/examinations",
          entityId: examId,
          dedupeKey,
        });
        if (ok) sent += 1;
      }
    }
  }

  return { ok: true as const, sent, scanned: (exams ?? []).length };
});
