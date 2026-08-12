/**
 * D4EXAM Access Control
 * ---------------------
 * Frontend visibility is NOT security. These helpers encode the product rules
 * for UI decisions. Authorization MUST also be enforced with Supabase RLS and
 * server-side checks (see supabase migrations).
 *
 * GOLDEN RULE (exam access):
 * Do not ask only "Is this person a student?".
 * Ask: Is this specific student from this specific school, faculty, department
 * and level, enrolled in this specific course, assigned to this specific
 * examination, and currently permitted to take it?
 * YES → ALLOW · NO → DENY
 */

import type {
  AppRole,
  Exam,
  ExamEligibilityContext,
  ExamStatus,
  Role,
} from "@/types";

/** Map UI dashboard role → DB role */
export const uiRoleToAppRole: Record<Role, AppRole> = {
  student: "student",
  teacher: "teacher",
  admin: "school_admin",
  officer: "examination_officer",
  "super-admin": "super_admin",
};

export const appRoleToUiRole: Record<AppRole, Role> = {
  student: "student",
  teacher: "teacher",
  school_admin: "admin",
  examination_officer: "officer",
  super_admin: "super-admin",
};

/** What each role is allowed to do (product rules). */
export const roleCapabilities = {
  super_admin: {
    managePlatform: true,
    approveSchoolApplications: true,
    manageAllSchools: true,
    viewPlatformAudit: true,
    createSchoolExams: false,
    markStudentExams: false,
    takeExams: false,
  },
  school_admin: {
    manageOwnSchoolOnly: true,
    importStudents: true,
    manageTeachers: true,
    manageOfficers: true,
    manageAcademics: true, // faculties, departments, levels, courses, sessions, semesters
    viewSchoolExamsAndResults: true,
    approveExams: false, // examination officer owns approval workflow
    takeExams: false,
  },
  examination_officer: {
    reviewTeacherExams: true,
    approveRejectRequestChanges: true,
    schedulePublishExams: true,
    liveMonitor: true,
    integrityReview: true,
    approveReleaseResults: true,
    createQuestions: false,
    markSubjective: false,
    takeExams: false,
  },
  teacher: {
    manageAssignedCoursesOnly: true,
    createQuestionBank: true,
    createExamsForAssignedCourses: true,
    submitExamForApproval: true,
    approveOwnExam: false, // never
    markSubjectiveForOwnCourses: true,
    viewResultsForOwnCourses: true,
    takeExams: false,
  },
  student: {
    takeEligibleExamsOnly: true,
    viewOwnResultsOnly: true,
    viewEnrolledCourses: true,
    createExams: false,
    approveExams: false,
    markExams: false,
  },
} as const;

export type CapabilityRole = keyof typeof roleCapabilities;

/** Exam statuses that mean the exam is not yet available to students. */
export const STUDENT_INVISIBLE_STATUSES: ExamStatus[] = [
  "draft",
  "pending_approval",
  "changes_requested",
  "rejected",
  "archived",
];

/** Statuses an officer can still act on for approval workflow. */
export const OFFICER_REVIEW_STATUSES: ExamStatus[] = [
  "pending_approval",
  "changes_requested",
];

/**
 * Golden rule — student exam eligibility.
 * Returns true only when ALL conditions that we can evaluate are satisfied.
 * Missing scope fields on the exam are treated as unrestricted for that axis
 * (caller should always pass complete exam metadata from the DB).
 */
export function isStudentEligibleForExam(
  student: ExamEligibilityContext,
  exam: Pick<
    Exam,
    | "schoolId"
    | "facultyId"
    | "departmentId"
    | "levelId"
    | "courseId"
    | "sessionId"
    | "semesterId"
    | "status"
  >,
  opts?: { now?: Date; scheduledStart?: string | null; scheduledEnd?: string | null },
): { allowed: boolean; reason?: string } {
  if (!exam.schoolId || student.schoolId !== exam.schoolId) {
    return { allowed: false, reason: "School mismatch" };
  }

  const status = (exam.status || "") as ExamStatus;
  if (STUDENT_INVISIBLE_STATUSES.includes(status)) {
    return { allowed: false, reason: `Exam is ${status}` };
  }
  if (status !== "scheduled" && status !== "published" && status !== "ongoing") {
    // approved but not yet scheduled/published still blocked
    if (status === "approved") {
      return { allowed: false, reason: "Exam approved but not yet published" };
    }
  }

  if (exam.facultyId && student.facultyId && exam.facultyId !== student.facultyId) {
    return { allowed: false, reason: "Faculty mismatch" };
  }
  if (exam.departmentId && student.departmentId && exam.departmentId !== student.departmentId) {
    return { allowed: false, reason: "Department mismatch" };
  }
  if (exam.levelId && student.levelId && exam.levelId !== student.levelId) {
    return { allowed: false, reason: "Level mismatch" };
  }
  if (exam.sessionId && student.sessionId && exam.sessionId !== student.sessionId) {
    return { allowed: false, reason: "Academic session mismatch" };
  }
  if (exam.semesterId && student.semesterId && exam.semesterId !== student.semesterId) {
    return { allowed: false, reason: "Semester mismatch" };
  }

  // Course enrollment is mandatory when the exam is tied to a course
  if (exam.courseId) {
    if (!student.enrolledCourseIds.includes(exam.courseId)) {
      return { allowed: false, reason: "Not enrolled in course" };
    }
  }

  // Schedule window (optional)
  const now = opts?.now ?? new Date();
  if (opts?.scheduledStart) {
    const start = new Date(opts.scheduledStart);
    if (now < start && status !== "ongoing") {
      return { allowed: false, reason: "Exam has not started" };
    }
  }
  if (opts?.scheduledEnd) {
    const end = new Date(opts.scheduledEnd);
    if (now > end) {
      return { allowed: false, reason: "Exam window closed" };
    }
  }

  return { allowed: true };
}

/** Teacher may only manage exams/questions for courses they are assigned to. */
export function teacherCanManageCourse(
  assignedCourseIds: string[],
  courseId: string | null | undefined,
): boolean {
  if (!courseId) return false;
  return assignedCourseIds.includes(courseId);
}

/** Teacher can never approve their own examination. */
export function teacherCanApproveExam(_teacherUserId: string, _examCreatedBy: string | null): boolean {
  return false;
}

/** Result privacy: students only see their own released results. */
export function studentCanViewResult(
  viewerStudentId: string,
  resultStudentId: string,
  resultStatus: string,
): boolean {
  if (viewerStudentId !== resultStudentId) return false;
  return resultStatus === "published";
}

/** Role may access a school-scoped resource. Super admin bypasses school scope. */
export function canAccessSchool(
  roles: AppRole[],
  userSchoolId: string | null,
  resourceSchoolId: string | null,
): boolean {
  if (roles.includes("super_admin")) return true;
  if (!userSchoolId || !resourceSchoolId) return false;
  return userSchoolId === resourceSchoolId;
}

/** Human-readable summary for docs / UI help. */
export const ROLE_SUMMARIES: Record<AppRole, string> = {
  super_admin:
    "Controls the entire D4EXAM platform. Approves schools, manages platform settings and audit. Does not create or mark normal school exams.",
  school_admin:
    "Manages one school: students, teachers, officers, faculties, departments, levels, courses, sessions and school settings. Views school exams and results.",
  examination_officer:
    "Owns the examination workflow: review/approve teacher exams, schedule, live monitor, integrity review, and result release.",
  teacher:
    "Manages only assigned courses. Builds question banks, creates exams, submits for approval, marks subjective answers. Cannot approve own exams.",
  student:
    "Takes only academically eligible exams, views enrolled courses and own released results. Cannot create, approve or mark exams.",
};
