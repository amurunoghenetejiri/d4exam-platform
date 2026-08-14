import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "student"
  | "teacher"
  | "school_admin"
  | "examination_officer"
  | "super_admin";

export const roleHome: Record<AppRole, string> = {
  student: "/student",
  teacher: "/teacher",
  school_admin: "/admin",
  examination_officer: "/officer",
  super_admin: "/super-admin",
};

export interface SessionUser {
  userId: string;
  profileId: string;
  email: string;
  fullName: string;
  status: string;
  schoolId: string | null;
  schoolName: string | null;
  schoolCode: string | null;
  schoolLogoUrl: string | null;
  roles: AppRole[];
  role: AppRole | null;
  identifier: string | null;
  identifierLabel: string;
}

export async function fetchSessionUser(): Promise<SessionUser | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  // Parallel: profile + roles at once (was sequential)
  const [profileRes, roleRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, status, school_id")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const profile = profileRes.data;
  const roles = (roleRes.data ?? []).map((r) => r.role as AppRole);

  let schoolName: string | null = null;
  let schoolCode: string | null = null;
  let schoolLogoUrl: string | null = null;
  let identifier: string | null = null;
  let identifierLabel = "Email";

  // Parallel school + role-specific identifier
  const extra: Promise<void>[] = [];

  if (profile?.school_id) {
    extra.push(
      (async () => {
        const { data: school } = await supabase
          .from("schools")
          .select("name, school_code, logo_url")
          .eq("id", profile.school_id!)
          .maybeSingle();
        schoolName = school?.name ?? null;
        schoolCode = school?.school_code ?? null;
        schoolLogoUrl = (school?.logo_url as string | null) ?? null;
      })(),
    );
  }

  if (profile) {
    if (roles.includes("student")) {
      extra.push(
        (async () => {
          const { data: s } = await supabase
            .from("students")
            .select("matric_number, student_id")
            .eq("profile_id", profile.id)
            .maybeSingle();
          identifier = s?.matric_number ?? s?.student_id ?? null;
          identifierLabel = "Matric number";
        })(),
      );
    } else if (roles.includes("teacher")) {
      extra.push(
        (async () => {
          const { data: t } = await supabase
            .from("teachers")
            .select("staff_id")
            .eq("profile_id", profile.id)
            .maybeSingle();
          identifier = t?.staff_id ?? null;
          identifierLabel = "Staff ID";
        })(),
      );
    } else if (roles.includes("examination_officer")) {
      extra.push(
        (async () => {
          const { data: o } = await supabase
            .from("examination_officers")
            .select("officer_id")
            .eq("profile_id", profile.id)
            .maybeSingle();
          identifier = o?.officer_id ?? null;
          identifierLabel = "Officer ID";
        })(),
      );
    }
  }

  if (extra.length) await Promise.all(extra);

  const priority: AppRole[] = [
    "super_admin",
    "school_admin",
    "examination_officer",
    "teacher",
    "student",
  ];

  return {
    userId: user.id,
    profileId: profile?.id ?? "",
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name || user.email || "",
    status: profile?.status ?? "pending",
    schoolId: profile?.school_id ?? null,
    schoolName,
    schoolCode,
    schoolLogoUrl,
    roles,
    role: priority.find((r) => roles.includes(r)) ?? null,
    identifier: identifier ?? profile?.email ?? null,
    identifierLabel,
  };
}

export function useSessionUser() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void queryClient.invalidateQueries({ queryKey: ["session-user"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: ["session-user"],
    queryFn: fetchSessionUser,
    staleTime: 5 * 60_000, // 5 minutes — was 30s, caused constant re-auth work
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? "")
      .join("") || "D4"
  );
}

export async function signOut() {
  await supabase.auth.signOut();
  if (typeof window !== "undefined") window.location.href = "/login";
}
