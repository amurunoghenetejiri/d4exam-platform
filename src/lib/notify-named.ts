/**
 * Named notification wrappers — prefer these at call sites for professional copy.
 * Reuses notifyUser / firePush from core notify.ts (in-app + push).
 * Templates: Notification 20.0 (notify-messages.ts).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  notifyUser,
  notifyMany,
  studentIdsToAuthUserIds,
  listAdminUserIds,
  type NotifyType,
} from "@/lib/notify";
import * as Msg from "@/lib/notify-messages";

async function authNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return map;
  try {
    const { data } = await supabase.from("profiles").select("auth_user_id, full_name").in("auth_user_id", uniq);
    for (const row of data ?? []) {
      const r = row as { auth_user_id?: string; full_name?: string };
      if (r.auth_user_id) map.set(r.auth_user_id, (r.full_name || "").trim() || "Student");
    }
  } catch {
    /* ignore */
  }
  return map;
}

function href(copy: Msg.NotificationTemplate, fallback: string): string {
  return (copy.action?.link || fallback || "").trim() || fallback;
}

export async function namedStudentResultPublished(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  officerName?: string | null;
  username?: string | null;
}): Promise<void> {
  const names = await authNames([opts.studentUserId]);
  const link = "/student/results";
  const copy = Msg.studentResultReady({
    studentName: names.get(opts.studentUserId) || "Student",
    username: opts.username,
    examTitle: opts.examTitle,
    courseCode: opts.courseCode,
    courseTitle: opts.courseTitle,
    officerName: opts.officerName,
    link,
  });
  await notifyUser({
    recipientUserId: opts.studentUserId,
    schoolId: opts.schoolId,
    title: copy.title,
    message: copy.message,
    type: "result_published",
    link: href(copy, link),
    entityType: "examination",
    entityId: opts.examId,
  });
}

export async function namedStudentsResultsReleased(opts: {
  schoolId: string;
  examId?: string;
  examTitle: string;
  studentAuthUserIds?: string[];
  studentIds?: string[];
  courseCode?: string | null;
  courseTitle?: string | null;
  officerName?: string | null;
}): Promise<void> {
  const fromAuth = [...new Set((opts.studentAuthUserIds ?? []).filter(Boolean))];
  const fromStudents = await studentIdsToAuthUserIds([...(opts.studentIds ?? [])]);
  const authIds = [...new Set([...fromAuth, ...fromStudents])];
  const names = await authNames(authIds);
  const examId = opts.examId || "released";
  const link = "/student/results";
  await notifyMany(
    authIds.map((uid) => {
      const copy = Msg.studentResultReady({
        studentName: names.get(uid) || "Student",
        examTitle: opts.examTitle,
        courseCode: opts.courseCode,
        courseTitle: opts.courseTitle,
        officerName: opts.officerName,
        link,
      });
      return {
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: copy.title,
        message: copy.message,
        type: "result_published" as NotifyType,
        link: href(copy, link),
        entityType: "examination",
        entityId: examId,
      };
    }),
  );
}

export async function namedTeacherExamDecision(opts: {
  teacherUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
  decision: "approved" | "rejected" | "revision_requested";
  note?: string | null;
  scheduleNote?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
  officerName?: string | null;
  start?: string | null;
  end?: string | null;
}): Promise<void> {
  const names = await authNames([opts.teacherUserId]);
  const teacherName = names.get(opts.teacherUserId) || "Teacher";
  const link = "/teacher/examinations";
  let copy: Msg.NotificationTemplate;
  let type: NotifyType = "info";
  if (opts.decision === "approved") {
    type = "exam_approved";
    copy = Msg.teacherExamApproved({
      teacherName,
      examTitle: opts.examTitle,
      courseCode: opts.courseCode,
      courseTitle: opts.courseTitle,
      officerName: opts.officerName,
      start: opts.start,
      end: opts.end,
      link,
    });
  } else if (opts.decision === "rejected") {
    type = "exam_rejected";
    copy = Msg.teacherExamRejected({
      teacherName,
      examTitle: opts.examTitle,
      courseCode: opts.courseCode,
      courseTitle: opts.courseTitle,
      reason: opts.note,
      note: opts.note,
      link,
    });
  } else {
    type = "exam_revision_requested";
    copy = Msg.teacherExamRevisionRequested({
      teacherName,
      examTitle: opts.examTitle,
      courseCode: opts.courseCode,
      courseTitle: opts.courseTitle,
      note: opts.note,
      link,
    });
  }
  let message = copy.message;
  if (opts.scheduleNote) {
    message = `${copy.message}\n${opts.scheduleNote}`;
  }
  await notifyUser({
    recipientUserId: opts.teacherUserId,
    schoolId: opts.schoolId,
    title: copy.title,
    message,
    type,
    link: href(copy, link),
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
}

export async function namedOfficersExamSubmitted(opts: {
  schoolId: string;
  examId: string;
  examTitle: string;
  teacherName?: string | null;
  courseLabel?: string | null;
  courseCode?: string | null;
  courseTitle?: string | null;
}): Promise<void> {
  const { listOfficerUserIds, listAdminUserIds } = await import("@/lib/notify");
  const [officers, admins] = await Promise.all([
    listOfficerUserIds(opts.schoolId),
    listAdminUserIds(opts.schoolId),
  ]);
  const recipients = [...new Set([...officers, ...admins])];
  const teacherName = (opts.teacherName || "A teacher").trim();
  await notifyMany(
    recipients.map((uid) => {
      const link = officers.includes(uid) ? "/officer/approvals" : "/admin/examinations";
      const copy = Msg.officerExamSubmittedForReview({
        teacherName,
        examTitle: opts.examTitle,
        courseCode: opts.courseCode ?? opts.courseLabel,
        courseTitle: opts.courseTitle,
        courseLabel: opts.courseLabel,
        link,
      });
      return {
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: copy.title,
        message: copy.message,
        type: "exam_submitted" as NotifyType,
        link: href(copy, link),
        entityType: "examination",
        entityId: opts.examId,
        dedupeMinutes: 10,
      };
    }),
  );
}
