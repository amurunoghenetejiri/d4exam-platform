import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout route for /super-admin/schools/*
 * Child routes:
 *   - super-admin.schools.index.tsx  → /super-admin/schools
 *   - super-admin.schools.$id.tsx    → /super-admin/schools/$id
 */
export const Route = createFileRoute("/super-admin/schools")({
  component: SchoolsLayout,
});

function SchoolsLayout() {
  return <Outlet />;
}
