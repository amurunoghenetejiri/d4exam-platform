import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminLayout } from "@/layouts";

export const Route = createFileRoute("/admin")({
  component: Layout,
});

function Layout() {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
