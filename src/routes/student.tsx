import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StudentLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";

export const Route = createFileRoute("/student")({
  ssr: false,
  beforeLoad: () => requireRole("student"),
  component: Layout,
});

function Layout() {
  return (
    <StudentLayout>
      <Outlet />
    </StudentLayout>
  );
}
