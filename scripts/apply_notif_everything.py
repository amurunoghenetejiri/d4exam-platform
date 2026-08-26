#!/usr/bin/env python3
"""Complete notification system: exact messages, reminders, weekly, officer push, delete-all, CTAs."""
from pathlib import Path
import re

def patch_page():
    p = Path("src/components/pages/NotificationsPage.tsx")
    t = p.read_text()
    if "Trash2" not in t:
        t = t.replace(
            'import { Bell, CheckCheck, Loader2 } from "lucide-react";',
            'import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";',
            1,
        )
    if "deleteAllNotifications" not in t:
        old = """  async function markAllRead() {
    if (!user?.userId) return;
    setBusy(true);
    try {
      const { error: upErr } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_user_id", user.userId)
        .is("read_at", null);
      if (upErr) throw upErr;
      await invalidateAll();
      toast.success("All notifications marked as read");
    } catch (e) {
      toast.error((e as Error).message || "Could not update");
    } finally {
      setBusy(false);
    }
  }"""
        new = old + """

  async function deleteAllNotifications() {
    if (!user?.userId) return;
    if (!window.confirm("Delete all notifications permanently? This cannot be undone.")) return;
    setBusy(true);
    try {
      const { error: delErr } = await supabase
        .from("notifications")
        .delete()
        .eq("recipient_user_id", user.userId);
      if (delErr) throw delErr;
      await invalidateAll();
      toast.success("All notifications deleted");
    } catch (e) {
      toast.error((e as Error).message || "Could not delete");
    } finally {
      setBusy(false);
    }
  }"""
        if old not in t:
            raise SystemExit("markAllRead missing on page")
        t = t.replace(old, new, 1)

    if "function actionLabelFor" not in t:
        t = t.replace(
            "function resolveNotifHref",
            '''function actionLabelFor(n: Notif): string | null {
  const ty = (n.type || "").toLowerCase();
  const msg = (n.message || "").toLowerCase();
  if (ty.includes("result") || msg.includes("view your result") || msg.includes("result has been released")) return "VIEW RESULT";
  if (ty === "exam_available" || msg.includes("starts now") || msg.includes("tap below to start")) return "START EXAM";
  if (ty.includes("exam") && (msg.includes("approved") || msg.includes("scheduled"))) return "VIEW EXAM";
  if (ty.includes("reject") || ty.includes("revision")) return "REVIEW";
  if (n.link || n.action_url) return "VIEW DETAILS";
  return null;
}

function resolveNotifHref''',
            1,
        )

    if "{href && actionLabelFor(n) && (" not in t:
        t = t.replace(
            """                <p className="mt-1 text-[11px] text-slate-400">
                  {new Date(n.created_at).toLocaleString()}
                  {href && <span className="ml-2 text-sky-600">Open →</span>}
                </p>""",
            """                <p className="mt-1 text-[11px] text-slate-400">
                  {new Date(n.created_at).toLocaleString()}
                </p>
                {href && actionLabelFor(n) && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2 h-7 text-[11px] font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (unreadItem) void markOne(n.id);
                      try { void navigate({ to: href as never }); } catch { window.location.assign(href); }
                    }}
                  >
                    {actionLabelFor(n)}
                  </Button>
                )}""",
            1,
        )

    # Force Delete all button
    if "Delete all" not in t.split("actions=")[-1][:800]:
        pat = re.compile(
            r"actions=\{\s*<Button\b[^>]*>.*?Mark all read\s*</Button>\s*\}",
            re.S,
        )
        m = pat.search(t)
        if m:
            repl = """actions={
          <div className=\"flex flex-wrap items-center gap-2\">
            <Button type=\"button\" variant=\"outline\" size=\"sm\" disabled={busy || unread === 0} onClick={() => void markAllRead()}>
              {busy ? <Loader2 className=\"mr-1 h-4 w-4 animate-spin\" /> : <CheckCheck className=\"mr-1 h-4 w-4\" />}
              Mark all read
            </Button>
            <Button type=\"button\" variant=\"outline\" size=\"sm\" disabled={busy || items.length === 0} onClick={() => void deleteAllNotifications()}>
              {busy ? <Loader2 className=\"mr-1 h-4 w-4 animate-spin\" /> : <Trash2 className=\"mr-1 h-4 w-4\" />}
              Delete all
            </Button>
          </div>
        }"""
            t = t[: m.start()] + repl + t[m.end() :]
            print("forced Delete all button")

    p.write_text(t)
    print("page OK")

def patch_notify_messages():
    p = Path("src/lib/notify.ts")
    t = p.read_text()

    if "authUserDisplayNames" not in t:
        t = t.replace(
            "async function courseStudentAuthIds",
            '''async function authUserDisplayNames(authIds: string[]): Promise<Map<string, string>> {
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

async function courseStudentAuthIds''',
            1,
        )

    replacements = [
        (
            'message: `Results for “${opts.examTitle}” have been released.`,',
            'message: `Student, your ${opts.examTitle} result has been released. Tap below to view your result.`,',
        ),
        (
            'message: `Your “${opts.examTitle}” result has been released. Tap to view your result.`,',
            'message: `Student, your ${opts.examTitle} result has been released. Tap below to view your result.`,',
        ),
        (
            'message: `Your “${opts.examTitle}” examination has been submitted successfully.`,',
            'message: `Student, your ${opts.examTitle} examination has been submitted successfully.`,',
        ),
        (
            'message: `Your submission for “${opts.examTitle}” was received.`,',
            'message: `Student, your ${opts.examTitle} examination has been submitted successfully.`,',
        ),
    ]
    for a, b in replacements:
        if a in t:
            t = t.replace(a, b, 1)

    if "notifyStudentExamReminder" not in t:
        t += r'''

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
'''

    if 'title: "📚 Examination Scheduled"' in t:
        t = t.replace('title: "📚 Examination Scheduled"', 'title: "🎓 Examination Approved"', 1)

    if "Departmental Officer" not in t:
        t = t.replace(
            'message: `Your “${opts.examTitle}” has been approved.`;',
            'message: `Your ${opts.examTitle} examination has been approved by the Departmental Officer.`;',
            1,
        )
        t = t.replace(
            'message: `Your “${opts.examTitle}” was rejected.${note ? ` ${note}` : ""}`;',
            'message: `Your ${opts.examTitle} examination was not approved by the Departmental Officer.${note ? ` Reason: ${note}` : ""} Tap to view the reason.`;',
            1,
        )

    p.write_text(t)
    print("notify OK")

def patch_security():
    p = Path("src/lib/cbt-security.ts")
    t = p.read_text()
    if "notifyOfficersStudentViolation" not in t:
        t = t.replace(
            'import { supabase } from "@/integrations/supabase/client";',
            'import { supabase } from "@/integrations/supabase/client";\nimport { notifyOfficersStudentViolation } from "@/lib/notify";',
            1,
        )
        if "void notifyOfficersStudentViolation" not in t:
            t = t.replace(
                '    } as never);\n  } catch (e) {\n    console.warn("logSecurityEvent failed", e);\n  }',
                '''    } as never);
    const sev = String(input.severity ?? "low").toLowerCase();
    if (sev === "medium" || sev === "high") {
      void notifyOfficersStudentViolation({
        schoolId: input.schoolId,
        examId: input.examId,
        studentId: input.studentId,
        eventType: String(input.eventType),
        description: input.description ?? null,
        severity: sev,
      });
    }
  } catch (e) {
    console.warn("logSecurityEvent failed", e);
  }''',
                1,
            )
    p.write_text(t)
    print("security OK")

def patch_student_index():
    p = Path("src/routes/student.index.tsx")
    t = p.read_text()
    if "processDueExamReminders" not in t:
        t = t.replace(
            'from "@/lib/utils";',
            'from "@/lib/utils";\nimport { processDueExamReminders } from "@/lib/notify";',
            1,
        )
    if "void processDueExamReminders" not in t:
        if "const { data: user } = useSessionUser();" in t:
            t = t.replace(
                "const { data: user } = useSessionUser();",
                '''const { data: user } = useSessionUser();

  useEffect(() => {
    const sid = student?.schoolId ?? user?.schoolId ?? null;
    if (!sid) return;
    const t = window.setTimeout(() => { void processDueExamReminders(sid); }, 2000);
    return () => window.clearTimeout(t);
  }, [student?.schoolId, user?.schoolId]);''',
                1,
            )
    t = t.replace("session?.schoolId", "user?.schoolId")
    p.write_text(t)
    print("student index OK")

def patch_student_exams():
    p = Path("src/routes/student.examinations.tsx")
    t = p.read_text()
    if "processDueExamReminders" not in t:
        t = t.replace(
            'from "@/integrations/supabase/client";',
            'from "@/integrations/supabase/client";\nimport { processDueExamReminders } from "@/lib/notify";',
            1,
        )
    if "void processDueExamReminders" not in t:
        needle = "  const schoolId = student?.schoolId ?? null;"
        if needle in t:
            t = t.replace(
                needle,
                needle
                + """

  useEffect(() => {
    if (!schoolId) return;
    const t = window.setTimeout(() => { void processDueExamReminders(schoolId); }, 2500);
    return () => window.clearTimeout(t);
  }, [schoolId]);""",
                1,
            )
    p.write_text(t)
    print("student exams OK")

def patch_admin():
    p = Path("src/routes/admin.index.tsx")
    t = p.read_text()
    if "processWeeklyAggregationSummaries" not in t:
        if 'from "react"' not in t:
            t = 'import { useEffect } from "react";\n' + t
        elif "useEffect" not in t.split('from "react"')[0]:
            t = 'import { useEffect } from "react";\n' + t
        t = t.replace(
            'from "@/lib/student.server";',
            'from "@/lib/student.server";\nimport { processWeeklyAggregationSummaries, processDueExamReminders } from "@/lib/notify";',
            1,
        )
        if "const schoolId = user?.schoolId ?? null;" in t and "processWeeklyAggregationSummaries" not in t.split("function Page")[1][:2000]:
            t = t.replace(
                "const schoolId = user?.schoolId ?? null;\n  const enabled = Boolean(schoolId);",
                """const schoolId = user?.schoolId ?? null;
  const enabled = Boolean(schoolId);

  useEffect(() => {
    if (!schoolId) return;
    const t = window.setTimeout(() => {
      void processDueExamReminders(schoolId);
      void processWeeklyAggregationSummaries(schoolId);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [schoolId]);""",
                1,
            )
    p.write_text(t)
    print("admin OK")

def main():
    patch_page()
    patch_notify_messages()
    patch_security()
    patch_student_index()
    patch_student_exams()
    patch_admin()
    print("ALL OK")

if __name__ == "__main__":
    main()
