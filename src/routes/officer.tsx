import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficerLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";

export const Route = createFileRoute("/officer")({
  ssr: false,
  beforeLoad: ({ context }) => requireRole("examination_officer", context.queryClient),
  component: Layout,
});

function Layout() {
  return (
    <OfficerLayout>
      <Outlet />
    </OfficerLayout>
  );
}
