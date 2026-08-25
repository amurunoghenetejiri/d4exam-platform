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

export type FaceViolationAction = "warn" | "flag" | "pause" | "terminate";

/** Screen sharing policy for an examination */
export type ScreenShareMode = "optional" | "required" | "disabled";

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
  /** @deprecated prefer screenShareMode; kept for older saved JSON */
  requireScreenShare: boolean;
  /** optional | required | disabled */
  screenShareMode: ScreenShareMode;
  faceDetection: boolean;
  maxFaceWarnings: number;
  faceViolationAction: FaceViolationAction;
  /** Tab-violation consequence when max tab switches is reached */
  thresholdAction: "flag" | "terminate" | "warn" | "pause" | "auto_submit";
  /** Pause duration in seconds when thresholdAction is pause (default 300 = 5 min) */
  pauseDurationSeconds?: number;
  resultVisibility: ResultVisibility;
  questionsToAnswer?: number | null;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  answer: number;
  type: string;
  marks: number;
  topic?: string;
  difficulty?: string;
  courseCode?: string;
}

export interface ResultRecord {
  id: string;
  course: string;
  title: string;
  score: number;
  grade: string;
  status: string;
  session?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  type: "info" | "success" | "warning" | "error" | string;
  read: boolean;
}

export interface ExamEligibilityContext {
  schoolId?: string | null;
  facultyId?: string | null;
  departmentId?: string | null;
  levelId?: string | null;
  sessionId?: string | null;
  semesterId?: string | null;
  enrolledCourseIds: string[];
}
