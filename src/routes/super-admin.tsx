import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SuperAdminLayout } from "@/layouts";

export const Route = createFileRoute("/super-admin")({
  component: Layout,
});

function Layout() {
  return (
    <SuperAdminLayout>
      <Outlet />
    </SuperAdminLayout>
  );
}
