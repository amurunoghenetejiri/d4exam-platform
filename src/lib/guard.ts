import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import {
  fetchSessionUser,
  readPendingLoginRole,
  clearPendingLoginRole,
  roleHome,
  type AppRole,
  type SessionUser,
} from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { offlineGet, OfflineKeys } from "@/lib/offline-cache";
import { readLastUserId } from "@/lib/offline-query";

/**
 * Client-side gate for a role area.
 * Database RLS still enforces real access — this only prevents wrong dashboards.
 *
 * Uses the React Query cache when available so sibling navigations (e.g.
 * /student → /student/results) do not re-hit Supabase and stall the page.
 * Offline: falls back to last cached SessionUser so the student shell still opens.
 */
export async function requireRole(role: AppRole | AppRole[], queryClient?: QueryClient) {
  const allowed = Array.isArray(role) ? role : [role];

  let user: SessionUser | null | undefined;
  if (queryClient) {
    user = queryClient.getQueryData<SessionUser | null>(["session-user"]);
  }

  let hasAuthSession = false;
  try {
    const { data: sess } = await supabase.auth.getSession();
    hasAuthSession = Boolean(sess.session?.access_token && sess.session.user?.id);
  } catch {
    hasAuthSession = false;
  }

  // Incomplete = school-bound role with no schoolId. NEVER trust that cache.
  const needsSchool = (u: SessionUser | null | undefined) =>
    Boolean(u?.role && u.role !== "super_admin" && !u.schoolId);
  const isIncomplete = (u: SessionUser | null | undefined) =>
    Boolean(u && (needsSchool(u) || (!u.fullName && !u.email)));

  const mustResolve =
    user === undefined ||
    (user === null && hasAuthSession) ||
    (hasAuthSession && isIncomplete(user));

  if (mustResolve) {
    try {
      user = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
      ]);
    } catch {
      user = null;
    }
    if ((!user || isIncomplete(user)) && hasAuthSession) {
      try {
        await new Promise((r) => setTimeout(r, 400));
        const again = await Promise.race([
          fetchSessionUser(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
        ]);
        if (again && (!user || !isIncomplete(again))) user = again;
        else if (again && isIncomplete(user) && !isIncomplete(again)) user = again;
        else if (again && !user) user = again;
      } catch {
        /* ignore */
      }
    }
    if (!user || isIncomplete(user)) {
      try {
        const last = readLastUserId();
        if (last) {
          const env = await offlineGet<SessionUser>(last, OfflineKeys.sessionUser);
          if (env?.data && !isIncomplete(env.data)) user = env.data;
        }
      } catch {
        /* ignore */
      }
    }
    if (queryClient && user && !isIncomplete(user)) {
      queryClient.setQueryData(["session-user"], user);
    }
  }

  if (!user) {
    // Last resort: valid Supabase session + role we just logged in with (avoids bounce to /login)
    try {
      const { data: sess } = await supabase.auth.getSession();
      const pending = readPendingLoginRole();
      if (sess.session?.user && pending && allowed.includes(pending)) {
        try {
          const hard = await Promise.race([
            fetchSessionUser(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_500)),
          ]);
          if (hard && (hard.role === "super_admin" || hard.schoolId)) {
            if (queryClient) queryClient.setQueryData(["session-user"], hard);
            clearPendingLoginRole();
            return { user: hard };
          }
        } catch {
          /* continue to minimal */
        }
        const minimal: SessionUser = {
          userId: sess.session.user.id,
          profileId: sess.session.user.id,
          email: sess.session.user.email || "",
          fullName: sess.session.user.email || "User",
          status: "active",
          schoolId: null,
          schoolName: null,
          schoolCode: null,
          schoolLogoUrl: null,
          roles: [pending],
          role: pending,
          identifier: sess.session.user.email || null,
          identifierLabel: "Email",
        };
        // Do NOT cache incomplete session — next navigation must re-resolve
        window.setTimeout(() => clearPendingLoginRole(), 60_000);
        return { user: minimal };
      }
      // Session exists but role not yet known — use pending even if allowed list is strict
      if (sess.session?.user && pending && pending in { student:1, teacher:1, school_admin:1, examination_officer:1, super_admin:1 }) {
        // Wrong dashboard: send to the correct home instead of login
        if (!allowed.includes(pending)) {
          throw redirect({ to: roleHome[pending] as never });
        }
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      /* ignore */
    }
    throw redirect({ to: "/login" });
  }

  const isSuper = user.roles.includes("super_admin") || user.role === "super_admin";

  if (user.status === "suspended" || user.status === "deactivated" || user.status === "locked") {
    throw redirect({ to: "/login", search: { blocked: "1" } as never });
  }

  if (
    !isSuper &&
    (user.status === "pending" || user.status === "invited") &&
    !user.role &&
    user.roles.length === 0
  ) {
    throw redirect({ to: "/login", search: { pending: "1" } as never });
  }

  const hasRole = allowed.some((r) => user!.roles.includes(r) || user!.role === r);
  if (!hasRole) {
    throw redirect({ to: (user.role ? roleHome[user.role] : "/login") as never });
  }

  return { user };
}

/** Super admin only. */
export async function requireSuperAdmin(queryClient?: QueryClient) {
  return requireRole("super_admin", queryClient);
}

/** School-scoped staff (admin, officer, teacher). */
export async function requireStaff(queryClient?: QueryClient) {
  return requireRole(["school_admin", "examination_officer", "teacher"], queryClient);
}
