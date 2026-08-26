/**
 * Named notification wrappers — prefer these at call sites for professional copy.
 * Reuses notifyUser / firePush from core notify.ts (in-app + push).
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

export async function namedStudentResultPublished(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
}): Promise<void> {
  const names = await authNames([opts.studentUserId]);
  const copy = Msg.studentResultReady({
    studentName: names.get(opts.studentUserId) || "Student",
    examTitle: opts.examTitle,
  });
  await notifyUser({
    recipientUserId: opts.studentUserId,
    schoolId: opts.schoolId,
    title: copy.title,
    message: copy.message,
    type: "result_published",
    link: "/student/results",
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
}): Promise<void> {
  const fromAuth = [...new Set((opts.studentAuthUserIds ?? []).filter(Boolean))];
  const fromStudents = await studentIdsToAuthUserIds([...(opts.studentIds ?? [])]);
  const authIds = [...new Set([...fromAuth, ...fromStudents])];
  const names = await authNames(authIds);
  const examId = opts.examId || "released";
  await notifyMany(
    authIds.map((uid) => {
      const copy = Msg.studentResultReady({
        studentName: names.get(uid) || "Student",
        examTitle: opts.examTitle,
      });
      return {
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: copy.title,
        message: copy.message,
        type: "result_published",
        link: "/student/results",
        entityType: "examination",
        entityId: examId,
        dedupeMinutes: 30,
      };
    }),
  );
}

export async function namedTeacherExamDecision(opts: {
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
  let teacherName = "Teacher";
  try {
    const { data: pr } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("auth_user_id", opts.teacherUserId)
      .maybeSingle();
    teacherName = (pr as { full_name?: string } | null)?.full_name?.trim() || "Teacher";
  } catch {
    /* ignore */
  }
  let type: NotifyType = "exam_approved";
  let copy = Msg.teacherExamApproved({ teacherName, examTitle: opts.examTitle });
  if (d.includes("reject")) {
    type = "exam_rejected";
    copy = Msg.teacherExamRejected({ teacherName, examTitle: opts.examTitle, note });
  } else if (d.includes("revision") || d.includes("change")) {
    type = "exam_revision_requested";
    copy = {
      title: `⚠️ ${teacherName}, CORRECTION REQUIRED`,
      message: `Your ${opts.examTitle} requires correction.${note ? ` ${note}` : ""}`,
    };
  } else if (opts.scheduleNote) {
    copy = { title: copy.title, message: `${copy.message}\n${opts.scheduleNote}` };
  }
  await notifyUser({
    recipientUserId: opts.teacherUserId,
    schoolId: opts.schoolId,
    title: copy.title,
    message: copy.message,
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
}
