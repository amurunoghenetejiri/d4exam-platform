import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SuperAdminLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";

export const Route = createFileRoute("/super-admin")({
  ssr: false,
  beforeLoad: ({ context }) => requireRole("super_admin", context.queryClient),
  component: Layout,
});

function Layout() {
  return (
    <SuperAdminLayout>
      <Outlet />
    </SuperAdminLayout>
  );
}
