import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StudentLayout } from "@/layouts";

export const Route = createFileRoute("/student")({
  component: Layout,
});

function Layout() {
  return (
    <StudentLayout>
      <Outlet />
    </StudentLayout>
  );
}
