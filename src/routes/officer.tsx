import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficerLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";

export const Route = createFileRoute("/officer")({
  ssr: false,
  beforeLoad: () => requireRole("examination_officer"),
  component: Layout,
});

function Layout() {
  return (
    <OfficerLayout>
      <Outlet />
    </OfficerLayout>
  );
}
