/**
 * D4EXAM — Named Notification Wrappers
 *
 * These functions connect real users to the notification message templates.
 *
 * IMPORTANT:
 * - recipientUserId MUST be auth.users.id
 * - Never use profiles.id as recipientUserId
 * - User names are retrieved from profiles.full_name
 * - No passwords, tokens, or secrets are included in notifications
 * - Message copy is controlled by notify-messages.ts
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

/* ============================================================
   USER NAME HELPERS
   ============================================================ */

/**
 * Get names for multiple auth user IDs.
 */
async function authNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const uniq = [...new Set(ids.filter(Boolean))];

  if (!uniq.length) return map;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("auth_user_id, full_name")
      .in("auth_user_id", uniq);

    if (error) return map;

    for (const row of data ?? []) {
      const r = row as {
        auth_user_id?: string;
        full_name?: string | null;
      };

      if (r.auth_user_id) {
        map.set(
          r.auth_user_id,
          (r.full_name || "").trim() || "User",
        );
      }
    }
  } catch {
    /* Ignore name lookup errors */
  }

  return map;
}

/**
 * Get one user's display name.
 */
async function authName(
  userId: string,
  fallback = "User",
): Promise<string> {
  const names = await authNames([userId]);
  return names.get(userId) || fallback;
}

/* ============================================================
   STUDENT — RESULTS
   ============================================================ */

export async function namedStudentResultPublished(opts: {
  studentUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
  courseCode?: string | null;
  officerName?: string | null;
}): Promise<void> {
  const studentName = await authName(
    opts.studentUserId,
    "Student",
  );

  const copy = Msg.studentResultReady({
    studentName,
    courseCode: opts.courseCode,
    examTitle: opts.examTitle,
    officerName: opts.officerName,
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

/* ============================================================
   STUDENTS — RESULTS RELEASED TO MANY STUDENTS
   ============================================================ */

export async function namedStudentsResultsReleased(opts: {
  schoolId: string;
  examId?: string;
  examTitle: string;
  courseCode?: string | null;
  studentAuthUserIds?: string[];
  studentIds?: string[];
  officerName?: string | null;
}): Promise<void> {
  const fromAuth = [
    ...new Set(
      (opts.studentAuthUserIds ?? []).filter(Boolean),
    ),
  ];

  const fromStudents = await studentIdsToAuthUserIds([
    ...(opts.studentIds ?? []),
  ]);

  const authIds = [
    ...new Set([
      ...fromAuth,
      ...fromStudents,
    ]),
  ];

  if (!authIds.length) return;

  const names = await authNames(authIds);

  const examId = opts.examId || "released";

  await notifyMany(
    authIds.map((uid) => {
      const copy = Msg.studentResultReady({
        studentName:
          names.get(uid) || "Student",
        courseCode: opts.courseCode,
        examTitle: opts.examTitle,
        officerName: opts.officerName,
      });

      return {
        recipientUserId: uid,
        schoolId: opts.schoolId,
        title: copy.title,
        message: copy.message,
        type: "result_published" as NotifyType,
        link: "/student/results",
        entityType: "examination",
        entityId: examId,
        dedupeMinutes: 30,
      };
    }),
  );
}

/* ============================================================
   TEACHER — EXAMINATION DECISION
   ============================================================ */

export async function namedTeacherExamDecision(opts: {
  teacherUserId: string;
  schoolId?: string | null;
  examId: string;
  examTitle: string;
  courseCode?: string | null;
  decision: string;
  note?: string | null;
  comment?: string | null;
  scheduleNote?: string | null;
  start?: string | null;
  end?: string | null;
}): Promise<void> {
  const teacherName = await authName(
    opts.teacherUserId,
    "Teacher",
  );

  const decision = String(
    opts.decision || "",
  ).toLowerCase();

  const reason = (
    opts.note ||
    opts.comment ||
    ""
  ).trim();

  let type: NotifyType = "exam_approved";

  let copy = Msg.teacherExamApproved({
    teacherName,
    courseCode: opts.courseCode,
    examTitle: opts.examTitle,
    start: opts.start,
    end: opts.end,
  });

  /* ---------------- APPROVED ---------------- */

  if (
    decision.includes("approve") ||
    decision.includes("approved")
  ) {
    type = "exam_approved";

    copy = Msg.teacherExamApproved({
      teacherName,
      courseCode: opts.courseCode,
      examTitle: opts.examTitle,
      start: opts.start,
      end: opts.end,
    });
  }

  /* ---------------- REJECTED ---------------- */

  else if (
    decision.includes("reject") ||
    decision.includes("rejected")
  ) {
    type = "exam_rejected";

    copy = Msg.teacherExamRejected({
      teacherName,
      courseCode: opts.courseCode,
      examTitle: opts.examTitle,
      reason,
    });
  }

  /* ---------------- REVISION REQUESTED ---------------- */

  else if (
    decision.includes("revision") ||
    decision.includes("change") ||
    decision.includes("revise")
  ) {
    type = "exam_revision_requested";

    copy = Msg.teacherExamRevisionRequested({
      teacherName,
      courseCode: opts.courseCode,
      examTitle: opts.examTitle,
      note: reason,
    });
  }

  /* ---------------- SCHEDULE NOTE ---------------- */

  if (opts.scheduleNote?.trim()) {
    copy = {
      title: copy.title,
      message:
        `${copy.message}\n\n📌 Additional information:\n${opts.scheduleNote.trim()}`,
    };
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

  /* ==========================================================
     ALSO NOTIFY SCHOOL ADMINS
     ========================================================== */

  if (
    opts.schoolId &&
    (
      type === "exam_approved" ||
      type === "exam_rejected"
    )
  ) {
    const admins = await listAdminUserIds(
      opts.schoolId,
    );

    await notifyMany(
      admins.map((uid) => ({
        recipientUserId: uid,
        schoolId: opts.schoolId,

        title:
          type === "exam_approved"
            ? "✅ Examination Approved"
            : "❌ Examination Rejected",

        message:
          type === "exam_approved"
            ? `The examination "${opts.examTitle}" submitted by ${teacherName} has been approved.`
            : `The examination "${opts.examTitle}" submitted by ${teacherName} has been rejected.${
                reason
                  ? `\n\nReason:\n${reason}`
                  : ""
              }`,

        type,

        link: "/admin/examinations",

        entityType: "examination",

        entityId: opts.examId,

        dedupeMinutes: 10,
      })),
    );
  }
}

/* ============================================================
   OFFICER / DEPARTMENTAL OFFICER — EXAM SUBMITTED
   ============================================================ */

export async function namedOfficersExamSubmitted(
  opts: {
    schoolId: string;
    examId: string;
    examTitle: string;
    teacherName?: string | null;
    courseLabel?: string | null;
    courseCode?: string | null;
  },
): Promise<void> {
  const {
    listOfficerUserIds,
    listAdminUserIds,
  } = await import("@/lib/notify");

  const [
    officers,
    admins,
  ] = await Promise.all([
    listOfficerUserIds(opts.schoolId),
    listAdminUserIds(opts.schoolId),
  ]);

  const recipients = [
    ...new Set([
      ...officers,
      ...admins,
    ]),
  ];

  if (!recipients.length) return;

  const teacherName =
    (opts.teacherName || "A teacher").trim();

  let schoolName: string | null = null;

  let schoolCode: string | null = null;

  try {
    const { data } = await supabase
      .from("schools")
      .select("name, school_code, code")
      .eq("id", opts.schoolId)
      .maybeSingle();

    const row = data as {
      name?: string;
      school_code?: string;
      code?: string;
    } | null;

    schoolName =
      row?.name?.trim() || null;

    schoolCode =
      (
        row?.school_code ||
        row?.code ||
        ""
      ).trim() || null;
  } catch {
    /* Ignore school lookup errors */
  }

  /*
   * Departmental officer notification.
   *
   * Uses the exact function available
   * in notify-messages.ts.
   */
  const copy =
    Msg.officerExamSubmittedForReview({
      officerName: null,
      teacherName,
      courseCode:
        opts.courseCode ||
        opts.courseLabel,
      examTitle: opts.examTitle,
    });

  await notifyMany(
    recipients.map((uid) => ({
      recipientUserId: uid,

      schoolId: opts.schoolId,

      title: copy.title,

      message: copy.message,

      type:
        "exam_submitted" as NotifyType,

      link: officers.includes(uid)
        ? "/officer/approvals"
        : "/admin/examinations",

      entityType: "examination",

      entityId: opts.examId,

      dedupeMinutes: 10,
    })),
  );
}

/* ============================================================
   STUDENT — EXAM SCHEDULED
   ============================================================ */

export async function namedStudentExamScheduled(
  opts: {
    studentUserId: string;
    schoolId?: string | null;
    examId: string;
    courseCode?: string | null;
    examTitle?: string | null;
    start?: string | null;
    end?: string | null;
  },
): Promise<void> {
  const studentName = await authName(
    opts.studentUserId,
    "Student",
  );

  const copy = Msg.studentExamScheduled({
    studentName,
    courseCode: opts.courseCode,
    examTitle: opts.examTitle,
    start: opts.start,
    end: opts.end,
  });

  await notifyUser({
    recipientUserId:
      opts.studentUserId,

    schoolId: opts.schoolId,

    title: copy.title,

    message: copy.message,

    type: "exam_scheduled",

    link: "/student/examinations",

    entityType: "examination",

    entityId: opts.examId,
  });
}

/* ============================================================
   STUDENT — EXAM CANCELLED
   ============================================================ */

export async function namedStudentExamCancelled(
  opts: {
    studentUserId: string;
    schoolId?: string | null;
    examId: string;
    courseCode?: string | null;
    examTitle?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const studentName = await authName(
    opts.studentUserId,
    "Student",
  );

  const copy = Msg.studentExamCancelled({
    studentName,
    courseCode: opts.courseCode,
    examTitle: opts.examTitle,
    reason: opts.reason,
  });

  await notifyUser({
    recipientUserId:
      opts.studentUserId,

    schoolId: opts.schoolId,

    title: copy.title,

    message: copy.message,

    type: "warning",

    link: "/student/examinations",

    entityType: "examination",

    entityId: opts.examId,
  });
}

/* ============================================================
   STUDENT — EXAM RESCHEDULED
   ============================================================ */

export async function namedStudentExamRescheduled(
  opts: {
    studentUserId: string;
    schoolId?: string | null;
    examId: string;
    courseCode?: string | null;
    examTitle?: string | null;
    start?: string | null;
    end?: string | null;
  },
): Promise<void> {
  const studentName = await authName(
    opts.studentUserId,
    "Student",
  );

  const copy = Msg.studentExamRescheduled({
    studentName,
    courseCode: opts.courseCode,
    examTitle: opts.examTitle,
    start: opts.start,
    end: opts.end,
  });

  await notifyUser({
    recipientUserId:
      opts.studentUserId,

    schoolId: opts.schoolId,

    title: copy.title,

    message: copy.message,

    type: "exam_scheduled",

    link: "/student/examinations",

    entityType: "examination",

    entityId: opts.examId,
  });
}

/* ============================================================
   STUDENT — EXAM WARNING
   ============================================================ */

export async function namedStudentExamWarning(
  opts: {
    studentUserId: string;
    schoolId?: string | null;
    examId?: string;
    message: string;
    violationCount?: number | null;
  },
): Promise<void> {
  const studentName = await authName(
    opts.studentUserId,
    "Student",
  );

  const copy = Msg.studentExamWarning({
    studentName,
    message: opts.message,
    violationCount:
      opts.violationCount,
  });

  await notifyUser({
    recipientUserId:
      opts.studentUserId,

    schoolId: opts.schoolId,

    title: copy.title,

    message: copy.message,

    type: "warning",

    link: "/student/exam",

    entityType: "examination",

    entityId: opts.examId || null,
  });
}

/* ============================================================
   STUDENT — EXAM TERMINATED
   ============================================================ */

export async function namedStudentExamTerminated(
  opts: {
    studentUserId: string;
    schoolId?: string | null;
    examId: string;
    courseCode?: string | null;
    examTitle?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const studentName = await authName(
    opts.studentUserId,
    "Student",
  );

  const copy = Msg.studentExamTerminated({
    studentName,
    courseCode: opts.courseCode,
    examTitle: opts.examTitle,
    reason: opts.reason,
  });

  await notifyUser({
    recipientUserId:
      opts.studentUserId,

    schoolId: opts.schoolId,

    title: copy.title,

    message: copy.message,

    type: "error",

    link: "/student/exam",

    entityType: "examination",

    entityId: opts.examId,
  });
}

/* ============================================================
   STUDENT — EXAM PAUSED
   ============================================================ */

export async function namedStudentExamPaused(
  opts: {
    studentUserId: string;
    schoolId?: string | null;
    examId: string;
    courseCode?: string | null;
    examTitle?: string | null;
    remainingLabel?: string | null;
  },
): Promise<void> {
  const studentName = await authName(
    opts.studentUserId,
    "Student",
  );

  const copy = Msg.studentExamPaused({
    studentName,
    courseCode: opts.courseCode,
    examTitle: opts.examTitle,
    remainingLabel:
      opts.remainingLabel,
  });

  await notifyUser({
    recipientUserId:
      opts.studentUserId,

    schoolId: opts.schoolId,

    title: copy.title,

    message: copy.message,

    type: "warning",

    link: "/student/exam",

    entityType: "examination",

    entityId: opts.examId,
  });
}

/* ============================================================
   STUDENT — AUTO SUBMITTED
   ============================================================ */

export async function namedStudentAutoSubmitted(
  opts: {
    studentUserId: string;
    schoolId?: string | null;
    examId: string;
    courseCode?: string | null;
    examTitle?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const studentName = await authName(
    opts.studentUserId,
    "Student",
  );

  const copy = Msg.studentAutoSubmitted({
    studentName,
    courseCode: opts.courseCode,
    examTitle: opts.examTitle,
    reason: opts.reason,
  });

  await notifyUser({
    recipientUserId:
      opts.studentUserId,

    schoolId: opts.schoolId,

    title: copy.title,

    message: copy.message,

    type: "exam_submitted",

    link: "/student/results",

    entityType: "examination",

    entityId: opts.examId,
  });
    }
