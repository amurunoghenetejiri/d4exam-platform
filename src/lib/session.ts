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

const PENDING_ROLE_KEY = "d4_pending_role";
const PENDING_ROLE_TS_KEY = "d4_pending_role_ts";

/** Remember role for a few seconds so post-login navigation is not bounced by a slow session read. */
export function seedPendingLoginRole(role: AppRole | string | null | undefined): void {
  if (typeof window === "undefined" || !role) return;
  const value = String(role);
  const ts = String(Date.now());
  try {
    window.sessionStorage.setItem(PENDING_ROLE_KEY, value);
    window.sessionStorage.setItem(PENDING_ROLE_TS_KEY, ts);
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.setItem(PENDING_ROLE_KEY, value);
    window.localStorage.setItem(PENDING_ROLE_TS_KEY, ts);
  } catch {
    /* ignore */
  }
}

function readPendingFrom(store: Storage | undefined, maxAgeMs: number): AppRole | null {
  if (!store) return null;
  try {
    const role = store.getItem(PENDING_ROLE_KEY);
    const ts = Number(store.getItem(PENDING_ROLE_TS_KEY) || 0);
    if (!role || !ts || Date.now() - ts > maxAgeMs) return null;
    if (role in roleHome) return role as AppRole;
  } catch {
    /* ignore */
  }
  return null;
}

export function readPendingLoginRole(maxAgeMs = 90_000): AppRole | null {
  if (typeof window === "undefined") return null;
  return (
    readPendingFrom(window.sessionStorage, maxAgeMs) ||
    readPendingFrom(window.localStorage, maxAgeMs)
  );
}

export function clearPendingLoginRole(): void {
  if (typeof window === "undefined") return;
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      store.removeItem(PENDING_ROLE_KEY);
      store.removeItem(PENDING_ROLE_TS_KEY);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Wait until supabase.auth reports a session (local first).
 * Call after setSession before navigating into a guarded route.
 */
export async function confirmSessionReady(maxAttempts = 12): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session?.access_token && sess.session.user?.id) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100 * (i + 1)));
  }
  try {
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user?.id);
  } catch {
    return false;
  }
}

export async function fetchSessionUser(): Promise<SessionUser | null> {
  // Prefer getSession (local) then getUser (network) so login handoff is reliable offline/slow.
  let user: { id: string; email?: string | null } | null = null;
  try {
    const { data: sessData } = await supabase.auth.getSession();
    if (sessData.session?.user) user = sessData.session.user;
  } catch {
    /* ignore */
  }
  if (!user) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      user = userData.user;
    } catch {
      /* ignore */
    }
  }
  if (!user) {
    // One short retry — setSession can lag a tick on WebView / slow devices.
    await new Promise((r) => setTimeout(r, 250));
    try {
      const { data: sessData } = await supabase.auth.getSession();
      if (sessData.session?.user) user = sessData.session.user;
    } catch {
      /* ignore */
    }
  }
  if (!user) return null;

  const [profileByAuth, profileById, roleRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, status, school_id, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, email, status, school_id, auth_user_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const profile = profileByAuth.data ?? profileById.data ?? null;
  let roles = (roleRes.data ?? []).map((r) => r.role as AppRole).filter(Boolean);

  if (roles.length === 0) {
    try {
      const { data: myRoles } = await supabase.rpc("get_my_roles");
      if (Array.isArray(myRoles) && myRoles.length) {
        roles = myRoles
          .map((r: { role?: string } | string) =>
            (typeof r === "string" ? r : String((r as { role?: string }).role || "")) as AppRole,
          )
          .filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  if (!roles.includes("super_admin")) {
    try {
      const { data: isSuper } = await supabase.rpc("is_super_admin");
      if (isSuper === true) {
        roles = ["super_admin", ...roles.filter((r) => r !== "super_admin")];
      }
    } catch {
      /* ignore */
    }
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

  // Bridge right after login when role query lags one tick
  if (roles.length === 0) {
    const pending = readPendingLoginRole();
    if (pending) roles = [pending];
  }

  let schoolName: string | null = null;
  let schoolCode: string | null = null;
  let schoolLogoUrl: string | null = null;
  let identifier: string | null = null;
  let identifierLabel = "Email";

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

  const primaryRole = priority.find((r) => roles.includes(r)) ?? null;

  let status = (profile?.status as string | undefined) ?? "pending";
  if (primaryRole === "super_admin" && (status === "pending" || status === "invited" || !profile)) {
    status = "active";
  }
  if (primaryRole && (status === "pending" || status === "invited")) {
    status = "active";
  }

  return {
    userId: user.id,
    profileId: profile?.id ?? user.id,
    email: profile?.email ?? user.email ?? "",
    fullName: profile?.full_name || user.email || "",
    status,
    schoolId: profile?.school_id ?? null,
    schoolName,
    schoolCode,
    schoolLogoUrl,
    roles,
    role: primaryRole,
    identifier: identifier ?? profile?.email ?? user.email ?? null,
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
          const u = await withTimeout(fetchSessionUser(), 18_000, "session");
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
    retry: 1,
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
  clearPendingLoginRole();
  if (typeof window !== "undefined") window.location.href = "/login";
}
