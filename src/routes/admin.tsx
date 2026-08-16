import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: ({ context }) => requireRole("school_admin", context.queryClient),
  component: Layout,
});

function Layout() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
