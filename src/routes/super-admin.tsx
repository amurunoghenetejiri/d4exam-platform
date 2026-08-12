import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SuperAdminLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";

export const Route = createFileRoute("/super-admin")({
  ssr: false,
  beforeLoad: () => requireRole("super_admin"),
  component: Layout,
});

function Layout() {
  return (
    <SuperAdminLayout>
      <Outlet />
    </SuperAdminLayout>
  );
}
