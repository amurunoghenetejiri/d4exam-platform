import { createFileRoute, Outlet } from "@tanstack/react-router";
import { TeacherLayout } from "@/layouts";

export const Route = createFileRoute("/teacher")({
  component: Layout,
});

function Layout() {
  return (
    <TeacherLayout>
      <Outlet />
    </TeacherLayout>
  );
}
