import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TeacherLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";

export const Route = createFileRoute("/teacher")({
  ssr: false,
  beforeLoad: ({ context }) => requireRole("teacher", context.queryClient),
  component: Layout,
});

function Layout() {
  return (
    <TeacherLayout>
      <Outlet />
    </TeacherLayout>
  );
}
