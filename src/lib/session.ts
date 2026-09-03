import { useQuery, useQueryClient } from "@tanstack/react-query";
import { offlineSet, OfflineKeys } from "@/lib/offline-cache";
import { rememberLastUserId, readLastUserId, withOfflineCache } from "@/lib/offline-query";
import { mirrorSessionUser } from "@/lib/local-db/mirror";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export function seedPendingLoginRole(role: AppRole | string | null | undefined): void {
  if (typeof window === "undefined" || !role) return;
  const value = String(role);
  const ts = String(Date.now());
  try {
    window.sessionStorage.setItem(PENDING_ROLE_KEY, value);
    window.sessionStorage.setItem(PENDING_ROLE_TS_KEY, ts);
  } catch {}
  try {
    window.localStorage.setItem(PENDING_ROLE_KEY, value);
    window.localStorage.setItem(PENDING_ROLE_TS_KEY, ts);
  } catch {}
}

function readPendingFrom(store: Storage | undefined, maxAgeMs: number): AppRole | null {
  if (!store) return null;
  try {
    const role = store.getItem(PENDING_ROLE_KEY);
    const ts = Number(store.getItem(PENDING_ROLE_TS_KEY) || 0);
    if (!role || !ts || Date.now() - ts > maxAgeMs) return null;
    if (role in roleHome) return role as AppRole;
  } catch {}
  return null;
}

export function readPendingLoginRole(maxAgeMs = 90_000): AppRole | null {
  if (typeof window === "undefined") return null;
  return readPendingFrom(window.sessionStorage, maxAgeMs) || readPendingFrom(window.localStorage, maxAgeMs);
}

export function clearPendingLoginRole(): void {
  if (typeof window === "undefined") return;
  for (const store of [window.sessionStorage, window.localStorage]) {
    try {
      store.removeItem(PENDING_ROLE_KEY);
      store.removeItem(PENDING_ROLE_TS_KEY);
    } catch {}
  }
}

export async function confirmSessionReady(maxAttempts = 12): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (sess.session?.access_token && sess.session.user?.id) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 100 * (i + 1)));
  }
  try {
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user?.id);
  } catch {
    return false;
  }
}

type SessionContextRpc = {
  profile_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  status?: string | null;
  school_id?: string | null;
  roles?: string[] | null;
  officer_id?: string | null;
  staff_id?: string | null;
  matric?: string | null;
};

function displayNameFromProfile(p: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null): string {
  if (!p) return "";
  const full = (p.full_name || "").trim();
  if (full) return full;
  return `${p.first_name || ""} ${p.last_name || ""}`.trim();
}

export async function fetchSessionUser(): Promise<SessionUser | null> {
  let user: { id: string; email?: string | null } | null = null;
  try {
    const { data: sessData } = await supabase.auth.getSession();
    if (sessData.session?.user) user = sessData.session.user;
  } catch {}
  if (!user) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      user = userData.user;
    } catch {}
  }
  if (!user) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const { data: sessData } = await supabase.auth.getSession();
      if (sessData.session?.user) user = sessData.session.user;
    } catch {}
  }
  if (!user) return null;

  let rpcCtx: SessionContextRpc | null = null;
  try {
    const { data } = await supabase.rpc("get_my_session_context" as never);
    if (data && typeof data === "object") rpcCtx = data as SessionContextRpc;
  } catch {
    /* RPC may not exist yet */
  }

  const [profileByAuth, profileById, roleRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, email, status, school_id, auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name, email, status, school_id, auth_user_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role, school_id, user_id").eq("user_id", user.id),
  ]);

  const profile = profileByAuth.data ?? profileById.data ?? null;
  let roles = (roleRes.data ?? []).map((r) => r.role as AppRole).filter(Boolean);
  if (Array.isArray(rpcCtx?.roles) && rpcCtx.roles.length) {
    roles = [...new Set([...roles, ...(rpcCtx.roles as AppRole[])])];
  }

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
    } catch {}
  }
  if (!roles.includes("super_admin")) {
    try {
      const { data: isSuper } = await supabase.rpc("is_super_admin");
      if (isSuper === true) {
        roles = ["super_admin", ...roles.filter((r) => r !== "super_admin")];
      }
    } catch {}
  }
  if (roles.length === 0) {
    const pending = readPendingLoginRole();
    if (pending) roles = [pending];
  }

  let schoolId: string | null =
    (rpcCtx?.school_id as string | null) ||
    (profile?.school_id as string | null) ||
    (roleRes.data ?? []).map((r) => (r as { school_id?: string | null }).school_id).find(Boolean) ||
    null;

  if (!schoolId && profile?.id) {
    try {
      const { data: extraRoles } = await supabase
        .from("user_roles")
        .select("role, school_id")
        .eq("user_id", profile.id);
      if (extraRoles?.length) {
        roles = [...new Set([...roles, ...extraRoles.map((r) => r.role as AppRole).filter(Boolean)])];
        schoolId = extraRoles.map((r) => r.school_id).find(Boolean) || schoolId;
      }
    } catch {}
  }

  if (!schoolId && profile?.id) {
    try {
      const { data: eo } = await supabase
        .from("examination_officers")
        .select("school_id, officer_id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (eo?.school_id) schoolId = eo.school_id as string;
    } catch {}
  }

  // Recover school + roles if profile lag / RLS left gaps
  if (!profile?.id || !schoolId) {
    try {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role, school_id, user_id")
        .eq("user_id", user.id);
      if (roleRows?.length) {
        roles = [
          ...new Set([
            ...roles,
            ...roleRows.map((r) => r.role as AppRole).filter(Boolean),
          ]),
        ];
        if (!schoolId) {
          schoolId = roleRows.map((r) => r.school_id).find(Boolean) || schoolId;
        }
      }
    } catch {}
  }

  let schoolName: string | null = null;
  let schoolCode: string | null = null;
  let schoolLogoUrl: string | null = null;
  let identifier: string | null = rpcCtx?.officer_id || rpcCtx?.staff_id || rpcCtx?.matric || null;
  let identifierLabel = identifier ? "ID" : "Email";

  // Prefer real profiles.id (not auth uid) for downstream teacher/officer/student joins
  let resolvedProfileId: string | null =
    (rpcCtx?.profile_id as string | undefined) || profile?.id || null;

  if (profile?.id && !identifier) {
    try {
      const [{ data: eo }, { data: teacher }, { data: student }] = await Promise.all([
        supabase.from("examination_officers").select("officer_id, school_id").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("teachers").select("staff_id, school_id").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("students").select("matric_number, student_id, school_id").eq("profile_id", profile.id).maybeSingle(),
      ]);
      if (!schoolId) schoolId = (eo?.school_id || teacher?.school_id || student?.school_id || null) as string | null;
      identifier = (eo?.officer_id || teacher?.staff_id || student?.matric_number || student?.student_id || null) as string | null;
      if (eo?.officer_id) identifierLabel = "Officer ID";
      else if (teacher?.staff_id) identifierLabel = "Staff ID";
      else if (student?.matric_number || student?.student_id) identifierLabel = "Matric";
    } catch {}
  }

  // Last-chance: profiles by auth_user_id → staff tables
  if (!schoolId || !resolvedProfileId) {
    try {
      const { data: profByAuth } = await supabase
        .from("profiles")
        .select("id, school_id, full_name, email, status")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (profByAuth?.id) {
        resolvedProfileId = resolvedProfileId || profByAuth.id;
        if (!schoolId && profByAuth.school_id) schoolId = profByAuth.school_id as string;
        const [{ data: eo }, { data: teacher }, { data: student }] = await Promise.all([
          supabase.from("examination_officers").select("officer_id, school_id").eq("profile_id", profByAuth.id).maybeSingle(),
          supabase.from("teachers").select("staff_id, school_id").eq("profile_id", profByAuth.id).maybeSingle(),
          supabase.from("students").select("matric_number, student_id, school_id").eq("profile_id", profByAuth.id).maybeSingle(),
        ]);
        if (!schoolId) schoolId = (eo?.school_id || teacher?.school_id || student?.school_id || null) as string | null;
        if (!identifier) {
          identifier = (eo?.officer_id || teacher?.staff_id || student?.matric_number || student?.student_id || null) as string | null;
          if (eo?.officer_id) identifierLabel = "Officer ID";
          else if (teacher?.staff_id) identifierLabel = "Staff ID";
          else if (student?.matric_number || student?.student_id) identifierLabel = "Matric";
        }
      }
    } catch {}
  }

  if (schoolId) {
    const { data: school } = await supabase
      .from("schools")
      .select("name, school_code, logo_url")
      .eq("id", schoolId)
      .maybeSingle();
    schoolName = school?.name ?? null;
    schoolCode = school?.school_code ?? null;
    schoolLogoUrl = (school?.logo_url as string | null) ?? null;
  }

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

  const fullName =
    displayNameFromProfile(profile) ||
    (rpcCtx?.full_name || "").trim() ||
    user.email ||
    "";

  return {
    userId: user.id,
    profileId: resolvedProfileId || (rpcCtx?.profile_id as string | undefined) || profile?.id || user.id,
    email: profile?.email ?? rpcCtx?.email ?? user.email ?? "",
    fullName,
    status,
    schoolId,
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
          const u = await withTimeout(fetchSessionUser(), 6_000, "session");
          if (u?.userId) {
            rememberLastUserId(u.userId);
            await offlineSet(u.userId, OfflineKeys.sessionUser, u, { schoolId: u.schoolId });
            void mirrorSessionUser(u);
          }
          return u;
        },
        { fallback: null, localFirst: true },
      );
    },
    networkMode: "offlineFirst",
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    retry: (count, err) => {
      const m = String((err as Error)?.message ?? err ?? "").toLowerCase();
      if (m.includes("offline") || m.includes("failed to fetch") || m.includes("network")) return false;
      return count < 1;
    },
    retryDelay: 800,
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
