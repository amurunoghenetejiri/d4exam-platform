export type Role = "student" | "teacher" | "admin" | "officer" | "super-admin";

export type ExamStatus =
  | "scheduled"
  | "ongoing"
  | "completed"
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

export interface Student {
  id: string;
  name: string;
  matric: string;
  email: string;
  department: string;
  level: string;
  status: "active" | "inactive" | "pending";
}

export interface Exam {
  id: string;
  code: string;
  title: string;
  course: string;
  date: string;
  duration: number;
  questions: number;
  status: ExamStatus;
  candidates?: number;
}

export interface ResultRecord {
  id: string;
  course: string;
  title: string;
  score: number;
  grade: string;
  status: "published" | "pending";
  session: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  answer?: number;
  type: "MCQ" | "True/False" | "Theory";
  marks: number;
  topic: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
}
