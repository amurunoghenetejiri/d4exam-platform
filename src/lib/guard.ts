import { redirect } from "@tanstack/react-router";
import { fetchSessionUser, roleHome, type AppRole } from "@/lib/session";

/**
 * Client-side gate for a role area.
 * Database RLS still enforces real access — this only prevents wrong dashboards.
 *
 * Frontend visibility is NOT security. Always validate on the server.
 */
export async function requireRole(role: AppRole | AppRole[]) {
  const allowed = Array.isArray(role) ? role : [role];
  const user = await fetchSessionUser();

  if (!user) {
    throw redirect({ to: "/login" });
  }

  if (user.status === "suspended" || user.status === "deactivated" || user.status === "locked") {
    throw redirect({ to: "/login", search: { blocked: "1" } as never });
  }

  if (user.status === "pending" || user.status === "invited") {
    // Invited accounts may still land on login until activated by admin
    throw redirect({ to: "/login", search: { pending: "1" } as never });
  }

  const hasRole = allowed.some((r) => user.roles.includes(r));
  if (!hasRole) {
    throw redirect({ to: (user.role ? roleHome[user.role] : "/login") as never });
  }

  return { user };
}

/** Super admin only. */
export async function requireSuperAdmin() {
  return requireRole("super_admin");
}

/** School-scoped staff (admin, officer, or teacher). */
export async function requireSchoolStaff() {
  return requireRole(["school_admin", "examination_officer", "teacher"]);
}
