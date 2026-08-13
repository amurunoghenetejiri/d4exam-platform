/** UI route roles (dashboards) */
export type Role = "student" | "teacher" | "admin" | "officer" | "super-admin";

/** Database / auth roles (user_roles.role) */
export type AppRole =
  | "student"
  | "teacher"
  | "school_admin"
  | "examination_officer"
  | "super_admin";

/** Full examination lifecycle (teacher → officer → students → results) */
export type ExamStatus =
  | "draft"
  | "pending_approval"
  | "changes_requested"
  | "rejected"
  | "approved"
  | "scheduled"
  | "published"
  | "ongoing"
  | "closed"
  | "completed"
  | "archived";

export type QuestionType =
  | "MCQ"
  | "True/False"
  | "Short Answer"
  | "Essay"
  | "Numerical"
  | "Theory";

export type ResultVisibility =
  | "immediate"
  | "after_marking"
  | "after_exam_closes"
  | "after_officer_release";

export type AccountStatus =
  | "pending"
  | "invited"
  | "active"
  | "suspended"
  | "deactivated"
  | "locked";

export interface Student {
  id: string;
  name: string;
  matric: string;
  email: string;
  school?: string;
  faculty?: string;
  department: string;
  level: string;
  status: "active" | "inactive" | "pending";
}

export interface Exam {
  id: string;
  code: string;
  title: string;
  course: string;
  courseCode?: string;
  date: string;
  duration: number;
  questions: number;
  status: ExamStatus | string;
  candidates?: number;
  schoolId?: string;
  facultyId?: string;
  departmentId?: string;
  levelId?: string;
  courseId?: string;
  sessionId?: string;
  semesterId?: string;
  createdBy?: string;
  totalMarks?: number;
  resultVisibility?: ResultVisibility;
}

export interface ExamSecuritySettings {
  fullscreen: boolean;
  tabMonitoring: boolean;
  maxTabSwitches: number;
  blockCopyPaste: boolean;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  requireCamera: boolean;
  requireMicrophone: boolean;
  thresholdAction: "flag" | "terminate" | "warn";
  resultVisibility: ResultVisibility;
  questionsToAnswer?: number | null;
}
