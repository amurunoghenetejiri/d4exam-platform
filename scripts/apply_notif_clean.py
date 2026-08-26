#!/usr/bin/env python3
"""Idempotent notification system improvements."""
from pathlib import Path

def main():
    # --- NotificationsPage ---
    p = Path("src/components/pages/NotificationsPage.tsx")
    t = p.read_text()
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
            raise SystemExit("markAllRead missing")
        t = t.replace(old, new, 1)
        print("deleteAll added")

    t = t.replace(
        'import { Bell, CheckCheck, Loader2 } from "lucide-react";',
        'import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";',
        1,
    )

    if "Delete all" not in t:
        old_a = """        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || unread === 0}
            onClick={() => void markAllRead()}
          >
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1 h-4 w-4" />}
            Mark all read
          </Button>
        }"""
        new_a = """        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || unread === 0}
              onClick={() => void markAllRead()}
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1 h-4 w-4" />}
              Mark all read
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || items.length === 0}
              onClick={() => void deleteAllNotifications()}
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              Delete all
            </Button>
          </div>
        }"""
        if old_a not in t:
            raise SystemExit("actions missing")
        t = t.replace(old_a, new_a, 1)
        print("Delete all button")

    if "exam_terminated" not in t:
        t = t.replace(
            'result_pending_release: "/student/results",\n      officer_warning:',
            'result_pending_release: "/student/results",\n      exam_submitted: "/student/results",\n      exam_terminated: "/student/examinations",\n      exam_paused: "/student/examinations",\n      officer_warning:',
            1,
        )
        print("href maps")
    p.write_text(t)

    # --- notify.ts ---
    p = Path("src/lib/notify.ts")
    t = p.read_text()

    replacements = [
        (
            'title: "📚 Examination Scheduled",\n        message: `“${opts.examTitle}” has been approved.${when}`,\n        type: "exam_scheduled",\n        link: "/student/examinations",',
            'title: "🎓 Examination Approved",\n        message: `Your “${opts.examTitle}” examination has been approved and is ready.${when} Open Examinations to prepare or start when it is time.`,\n        type: "exam_scheduled",\n        link: `/student/exam/${opts.examId}`,',
        ),
        (
            '''    const when = opts.scheduledStart
      ? ` Scheduled to start ${new Date(opts.scheduledStart).toLocaleString()}.`
      : "";''',
            '''    const startLabel = opts.scheduledStart
      ? new Date(opts.scheduledStart).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "";
    const when = startLabel
      ? ` It is scheduled for ${startLabel}.`
      : "";''',
        ),
        (
            'message: `Results for “${opts.examTitle}” have been released.`,',
            'message: `Your “${opts.examTitle}” result has been released. Tap to view your result.`,',
        ),
        (
            'message: `Your “${opts.examTitle}” has been approved.`;',
            'message: `Your “${opts.examTitle}” examination has been approved by the Departmental Officer.`;',
        ),
        (
            'message: `Your “${opts.examTitle}” was rejected.${note ? ` ${note}` : ""}`;',
            'message: `Your “${opts.examTitle}” examination was not approved by the Departmental Officer.${note ? ` Reason: ${note}` : ""} Tap to review.`;',
        ),
        (
            'title: "📝 Examination Submitted",\n        message: `“${opts.examTitle}”${course} was submitted${who} for approval.`,',
            'title: "📝 Examination Submitted for Approval",\n        message: `${opts.teacherName ? opts.teacherName + " has submitted" : "A teacher submitted"} “${opts.examTitle}”${course} for approval.`,',
        ),
        (
            'message: `Your submission for “${opts.examTitle}” was received.`,',
            'message: `Your “${opts.examTitle}” examination has been submitted successfully.`,',
        ),
    ]
    for a, b in replacements:
        if a in t:
            t = t.replace(a, b, 1)
            print("replaced one")

    if "notifyStudentExamTerminated" not in t:
        t += r'''

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
'''
        print("helpers added")
    p.write_text(t)

    # --- CBT session ---
    p = Path("src/components/cbt/CbtExamSession.impl.tsx")
    t = p.read_text()
    if "notifyStudentExamSubmitted" not in t:
        t = t.replace(
            'import { haptic } from "@/lib/haptic";',
            'import { haptic } from "@/lib/haptic";\nimport {\n  notifyStudentExamSubmitted,\n  notifyStudentExamTerminated,\n  notifyStudentExamAutoSubmitted,\n} from "@/lib/notify";',
            1,
        )
        print("cbt import")
    if "void notifyStudentExamSubmitted" not in t:
        needle = '          toast.success(saved.published ? "Examination submitted — result is available now" : "Examination submitted successfully");\n        }\n        await qc.invalidateQueries({ queryKey: ["student-exams"] });'
        insert = '''          toast.success(saved.published ? "Examination submitted — result is available now" : "Examination submitted successfully");
          try {
            const examTitle = String(examQ.data?.title || "your examination");
            const schoolId = String(examQ.data?.school_id ?? student.schoolId ?? session?.schoolId ?? "") || null;
            const authUid = session?.userId || "";
            if (auto) {
              const reason = (terminationReason || "").toLowerCase();
              if (
                reason.includes("auto") ||
                reason.includes("automatically submitted") ||
                reason.includes("tab violation")
              ) {
                void notifyStudentExamAutoSubmitted({
                  studentUserId: authUid || undefined,
                  studentId: student.studentId,
                  schoolId,
                  examId: id,
                  examTitle,
                });
              } else {
                void notifyStudentExamTerminated({
                  studentUserId: authUid || undefined,
                  studentId: student.studentId,
                  schoolId,
                  examId: id,
                  examTitle,
                  reason: terminationReason || null,
                });
              }
            } else if (authUid) {
              void notifyStudentExamSubmitted({
                studentUserId: authUid,
                schoolId,
                examId: id,
                examTitle,
              });
            }
          } catch {
            /* non-blocking */
          }
        }
        await qc.invalidateQueries({ queryKey: ["student-exams"] });'''
        if needle not in t:
            raise SystemExit("cbt needle missing")
        t = t.replace(needle, insert, 1)
        print("cbt wired")
    p.write_text(t)
    print("ALL OK")

if __name__ == "__main__":
    main()
