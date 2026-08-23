import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { fetchSessionUser, roleHome, type AppRole, type SessionUser } from "@/lib/session";

/**
 * Client-side gate for a role area.
 * Database RLS still enforces real access — this only prevents wrong dashboards.
 *
 * Uses the React Query cache when available so sibling navigations (e.g.
 * /student → /student/results) do not re-hit Supabase and stall the page.
 */
export async function requireRole(role: AppRole | AppRole[], queryClient?: QueryClient) {
  const allowed = Array.isArray(role) ? role : [role];

  let user: SessionUser | null | undefined;
  if (queryClient) {
    user = queryClient.getQueryData<SessionUser | null>(["session-user"]);
  }
  if (user === undefined) {
    try {
      user = await Promise.race([
        fetchSessionUser(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
      ]);
    } catch {
      user = null;
    }
    if (queryClient) {
      queryClient.setQueryData(["session-user"], user);
    }
  }

  if (!user) {
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

/** School-scoped staff (admin, officer, or teacher). */
export async function requireSchoolStaff(queryClient?: QueryClient) {
  return requireRole(["school_admin", "examination_officer", "teacher"], queryClient);
}
