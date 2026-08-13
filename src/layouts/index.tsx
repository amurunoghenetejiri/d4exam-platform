import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  adminNav,
  officerNav,
  studentNav,
  superAdminNav,
  teacherNav,
} from "@/components/navigation/navConfig";
import type { RoleConfig } from "@/components/navigation/navConfig";
import { initials, useSessionUser } from "@/lib/session";

function RoleShell({ config, children }: { config: RoleConfig; children: ReactNode }) {
  const { data: user } = useSessionUser();

  return (
    <AppShell
      config={config}
      user={{
        name: user?.fullName ?? "…",
        avatar: initials(user?.fullName ?? ""),
        subtitle: user?.identifier ?? user?.schoolName ?? "",
      }}
    >
      {children}
    </AppShell>
  );
}

/** CBT exam must be distraction-free: no sidebar, top bar, or bottom nav. */
export function StudentLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isExamMode = pathname.startsWith("/student/exam/");

  if (isExamMode) {
    return <>{children}</>;
  }

  return <RoleShell config={studentNav}>{children}</RoleShell>;
}

export function TeacherLayout({ children }: { children: ReactNode }) {
  return <RoleShell config={teacherNav}>{children}</RoleShell>;
}

export function AdminLayout({ children }: { children: ReactNode }) {
  return <RoleShell config={adminNav}>{children}</RoleShell>;
}

export function OfficerLayout({ children }: { children: ReactNode }) {
  return <RoleShell config={officerNav}>{children}</RoleShell>;
}

export function SuperAdminLayout({ children }: { children: ReactNode }) {
  return <RoleShell config={superAdminNav}>{children}</RoleShell>;
}
