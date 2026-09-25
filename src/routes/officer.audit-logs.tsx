import { createFileRoute, redirect } from "@tanstack/react-router";

/** Audit logs nav item replaced by Student reports — keep route for bookmarks. */
export const Route = createFileRoute("/officer/audit-logs")({
  beforeLoad: () => {
    throw redirect({ to: "/officer/reports" });
  },
  component: () => null,
});
