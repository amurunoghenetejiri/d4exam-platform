import {
  LayoutDashboard,
  FileText,
  BarChart3,
  BookOpen,
  Bell,
  User,
  Settings,
  Users,
  GraduationCap,
  ClipboardList,
  ShieldCheck,
  Building2,
  CalendarDays,
  Layers,
  UploadCloud,
  CheckSquare,
  Radio,
  ScrollText,
  CreditCard,
  Blocks,
  PenSquare,
  Home,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface RoleConfig {
  role: Role;
  label: string;
  home: string;
  groups: NavGroup[];
  bottomNav?: NavItem[];
}

export const studentNav: RoleConfig = {
  role: "student",
  label: "Student",
  home: "/student",
  groups: [
    {
      items: [
        { label: "Dashboard", to: "/student", icon: LayoutDashboard },
        { label: "My Exams", to: "/student/examinations", icon: FileText },
        { label: "Results", to: "/student/results", icon: BarChart3 },
        { label: "Courses", to: "/student/courses", icon: BookOpen },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Notifications", to: "/student/notifications", icon: Bell },
        { label: "Profile", to: "/student/profile", icon: User },
        { label: "Settings", to: "/student/settings", icon: Settings },
      ],
    },
  ],
  bottomNav: [
    { label: "Home", to: "/student", icon: Home },
    { label: "Exams", to: "/student/examinations", icon: FileText },
    { label: "Results", to: "/student/results", icon: BarChart3 },
    { label: "Profile", to: "/student/profile", icon: User },
  ],
};

export const teacherNav: RoleConfig = {
  role: "teacher",
  label: "Teacher",
  home: "/teacher",
  groups: [
    {
      items: [
        { label: "Dashboard", to: "/teacher", icon: LayoutDashboard },
        { label: "My Courses", to: "/teacher/courses", icon: BookOpen },
        { label: "Question Bank", to: "/teacher/question-bank", icon: Layers },
        { label: "Examinations", to: "/teacher/examinations", icon: FileText },
      ],
    },
    {
      label: "Delivery",
      items: [
        { label: "Live Exams", to: "/teacher/live-exams", icon: Radio },
        { label: "Exam Security", to: "/teacher/exam-security", icon: ShieldCheck },
        { label: "Integrity Monitoring", to: "/teacher/integrity", icon: ShieldCheck },
      ],
    },
    {
      label: "Assessment",
      items: [
        { label: "Submissions", to: "/teacher/submissions", icon: ClipboardList },
        { label: "Marking Center", to: "/teacher/marking", icon: PenSquare },
        { label: "Results", to: "/teacher/results", icon: BarChart3 },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Notifications", to: "/teacher/notifications", icon: Bell },
        { label: "Profile", to: "/teacher/profile", icon: User },
        { label: "Settings", to: "/teacher/settings", icon: Settings },
      ],
    },
  ],
  bottomNav: [
    { label: "Home", to: "/teacher", icon: Home },
    { label: "Exams", to: "/teacher/examinations", icon: FileText },
    { label: "Marking", to: "/teacher/marking", icon: PenSquare },
    { label: "Profile", to: "/teacher/profile", icon: User },
  ],
};

export const adminNav: RoleConfig = {
  role: "admin",
  label: "School Admin",
  home: "/admin",
  groups: [
    {
      items: [
        { label: "Dashboard", to: "/admin", icon: LayoutDashboard },
        { label: "Users", to: "/admin/users", icon: Users },
        { label: "Students", to: "/admin/students", icon: GraduationCap },
        { label: "Student Import", to: "/admin/student-import", icon: UploadCloud },
        { label: "Teachers", to: "/admin/teachers", icon: Users },
      ],
    },
    {
      label: "Academics",
      items: [
        { label: "Faculties", to: "/admin/faculties", icon: Building2 },
        { label: "Departments", to: "/admin/departments", icon: Blocks },
        { label: "Levels", to: "/admin/levels", icon: Layers },
        { label: "Courses", to: "/admin/courses", icon: BookOpen },
        { label: "Sessions", to: "/admin/sessions", icon: CalendarDays },
        { label: "Semesters", to: "/admin/semesters", icon: CalendarDays },
      ],
    },
    {
      label: "Assessment",
      items: [
        { label: "Examinations", to: "/admin/examinations", icon: FileText },
        { label: "Results", to: "/admin/results", icon: BarChart3 },
        { label: "Reports", to: "/admin/reports", icon: ScrollText },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Notifications", to: "/admin/notifications", icon: Bell },
        { label: "Profile", to: "/admin/profile", icon: User },
        { label: "Settings", to: "/admin/settings", icon: Settings },
      ],
    },
  ],
  bottomNav: [
    { label: "Home", to: "/admin", icon: Home },
    { label: "Students", to: "/admin/students", icon: GraduationCap },
    { label: "Exams", to: "/admin/examinations", icon: FileText },
    { label: "Profile", to: "/admin/profile", icon: User },
  ],
};

export const officerNav: RoleConfig = {
  role: "officer",
  label: "Examination Officer",
  home: "/officer",
  groups: [
    {
      items: [
        { label: "Dashboard", to: "/officer", icon: LayoutDashboard },
        { label: "Exam Approvals", to: "/officer/approvals", icon: CheckSquare },
        { label: "Live Monitor", to: "/officer/live-monitor", icon: Radio },
        { label: "Integrity Review", to: "/officer/integrity", icon: ShieldCheck },
      ],
    },
    {
      label: "Records",
      items: [
        { label: "Results", to: "/officer/results", icon: BarChart3 },
        { label: "Reports", to: "/officer/reports", icon: ScrollText },
        { label: "Audit Logs", to: "/officer/audit-logs", icon: ScrollText },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Notifications", to: "/officer/notifications", icon: Bell },
        { label: "Settings", to: "/officer/settings", icon: Settings },
      ],
    },
  ],
  bottomNav: [
    { label: "Home", to: "/officer", icon: Home },
    { label: "Approvals", to: "/officer/approvals", icon: CheckSquare },
    { label: "Monitor", to: "/officer/live-monitor", icon: Radio },
    { label: "Results", to: "/officer/results", icon: BarChart3 },
  ],
};

export const superAdminNav: RoleConfig = {
  role: "super-admin",
  label: "Super Admin",
  home: "/super-admin",
  groups: [
    {
      items: [
        { label: "Dashboard", to: "/super-admin", icon: LayoutDashboard },
        { label: "Schools", to: "/super-admin/schools", icon: Building2 },
        { label: "School Applications", to: "/super-admin/applications", icon: ClipboardList },
        { label: "Platform Users", to: "/super-admin/users", icon: Users },
        { label: "Examinations", to: "/super-admin/examinations", icon: FileText },
      ],
    },
    {
      label: "Business",
      items: [
        { label: "Subscriptions", to: "/super-admin/subscriptions", icon: CreditCard },
        { label: "Reports", to: "/super-admin/reports", icon: ScrollText },
        { label: "Audit Logs", to: "/super-admin/audit-logs", icon: ScrollText },
      ],
    },
    {
      label: "Account",
      items: [
        { label: "Platform Settings", to: "/super-admin/settings", icon: Settings },
        { label: "Notifications", to: "/super-admin/notifications", icon: Bell },
        { label: "Profile", to: "/super-admin/profile", icon: User },
      ],
    },
  ],
  bottomNav: [
    { label: "Home", to: "/super-admin", icon: Home },
    { label: "Schools", to: "/super-admin/schools", icon: Building2 },
    { label: "Users", to: "/super-admin/users", icon: Users },
    { label: "More", to: "/super-admin/settings", icon: Settings },
  ],
};
