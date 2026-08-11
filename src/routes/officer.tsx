import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficerLayout } from "@/layouts";

export const Route = createFileRoute("/officer")({
  component: Layout,
});

function Layout() {
  return (
    <OfficerLayout>
      <Outlet />
    </OfficerLayout>
  );
}
