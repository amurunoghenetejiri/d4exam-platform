import { useQuery, useQueryClient } from "@tanstack/react-query";
import { offlineSet, OfflineKeys } from "@/lib/offline-cache";
import { rememberLastUserId, readLastUserId, withOfflineCache } from "@/lib/offline-query";
import { mirrorSessionUser } from "@/lib/local-db/mirror";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Bound async work so login/session never hang forever. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

export type SessionUser = {
  userId: string;
  email: string | null;
  fullName: string | null;
  schoolId: string | null;
  schoolName: string | null;
  schoolCode: string | null;
  schoolLogoUrl: string | null;
  roles: AppRole[];
  role: AppRole | null;
  identifier: string | null;
  identifierLabel: string;
};

const ROLE_PRIORITY: AppRole[] = [
  "super_admin",
  "school_admin",
  "examination_officer",
  "teacher",
  "student",
];

export async function fetchSessionUser(): Promise<SessionUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let roles: AppRole[] = [];
  try {
    const { data: myRoles } = await supabase.rpc("get_my_roles");
    if (Array.isArray(myRoles)) {
      roles = myRoles
        .map((r: { role?: string } | string) =>
          typeof r === "string" ? (r as AppRole) : ((r as { role?: string }).role as AppRole),
        )
        .filter(Boolean);
    }
  } catch {
    /* ignore */
  }
  if (roles.length === 0) {
    try {
      const { data: hasAny } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .limit(5);
      if (hasAny?.length) roles = hasAny.map((r) => r.role as AppRole).filter(Boolean);
    } catch {
      /* ignore */
    }
  }

  let schoolName: string | null = null;
  let schoolCode: string | null = null;
  let schoolLogoUrl: string | null = null;
  let identifier: string | null = null;
  let identifierLabel = "Email";
  let schoolId: string | null = null;
  let fullName: string | null = null;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, school_id, email")
      .eq("id", user.id)
      .maybeSingle();
    fullName = profile?.full_name ?? null;
    schoolId = profile?.school_id ?? null;
    identifier = profile?.email ?? user.email ?? null;

    if (schoolId) {
      const { data: school } = await supabase
        .from("schools")
        .select("name, code, logo_url")
        .eq("id", schoolId)
        .maybeSingle();
      schoolName = school?.name ?? null;
      schoolCode = school?.code ?? null;
      schoolLogoUrl = school?.logo_url ?? null;
    }
  } catch {
    /* ignore */
  }

  const primaryRole =
    ROLE_PRIORITY.find((r) => roles.map((x) => String(x).toLowerCase()).includes(r)) ??
    (roles[0] as AppRole | undefined) ??
    null;

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName,
    schoolId,
    schoolName,
    schoolCode,
    schoolLogoUrl,
    roles,
    role: primaryRole,
    identifier,
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
    queryFn: async () => {
      const last = readLastUserId();
      return withOfflineCache(
        last,
        OfflineKeys.sessionUser,
        async () => {
          const u = await withTimeout(fetchSessionUser(), 6_000, "session");
          if (u?.userId) {
            rememberLastUserId(u.userId);
            await offlineSet(u.userId, OfflineKeys.sessionUser, u, { schoolId: u.schoolId });
            void mirrorSessionUser(u);
          }
          return u;
        },
        { fallback: null },
      );
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
    retryDelay: 1_500,
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
