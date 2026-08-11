import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  adminNav,
  officerNav,
  studentNav,
  superAdminNav,
  teacherNav,
} from "@/components/navigation/navConfig";
import {
  currentAdmin,
  currentOfficer,
  currentStudent,
  currentSuperAdmin,
  currentTeacher,
} from "@/data/mock";

export function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      config={studentNav}
      user={{
        name: currentStudent.name,
        avatar: currentStudent.avatar,
        subtitle: currentStudent.matric,
      }}
    >
      {children}
    </AppShell>
  );
}

export function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      config={teacherNav}
      user={{
        name: currentTeacher.name,
        avatar: currentTeacher.avatar,
        subtitle: currentTeacher.department,
      }}
    >
      {children}
    </AppShell>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      config={adminNav}
      user={{ name: currentAdmin.name, avatar: currentAdmin.avatar, subtitle: currentAdmin.role }}
    >
      {children}
    </AppShell>
  );
}

export function OfficerLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      config={officerNav}
      user={{
        name: currentOfficer.name,
        avatar: currentOfficer.avatar,
        subtitle: currentOfficer.role,
      }}
    >
      {children}
    </AppShell>
  );
}

export function SuperAdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      config={superAdminNav}
      user={{
        name: currentSuperAdmin.name,
        avatar: currentSuperAdmin.avatar,
        subtitle: currentSuperAdmin.role,
      }}
    >
      {children}
    </AppShell>
  );
}
