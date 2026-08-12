import { redirect } from "@tanstack/react-router";
import { fetchSessionUser, roleHome, type AppRole } from "@/lib/session";

/**
 * Client-side gate for a role area. The database still enforces access through
 * row level security — this only keeps the wrong dashboard from rendering.
 */
export async function requireRole(role: AppRole) {
  const user = await fetchSessionUser();
  if (!user) throw redirect({ to: "/login" });
  if (user.status === "suspended" || user.status === "deactivated" || user.status === "locked") {
    throw redirect({ to: "/login", search: { blocked: "1" } as never });
  }
  if (!user.roles.includes(role)) {
    throw redirect({ to: (user.role ? roleHome[user.role] : "/login") as never });
  }
  return { user };
}
