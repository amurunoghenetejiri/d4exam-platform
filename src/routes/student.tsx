import { createFileRoute, Outlet } from "@tanstack/react-router";
import { StudentLayout } from "@/layouts";
import { requireRole } from "@/lib/guard";
import { useStudentContext, useStudentRealtimeSync } from "@/lib/student";

export const Route = createFileRoute("/student")({
  ssr: false,
  beforeLoad: ({ context }) => requireRole("student", context.queryClient),
  component: Layout,
});

function Layout() {
  const { data: student } = useStudentContext();
  useStudentRealtimeSync(Boolean(student?.studentId));

  return (
    <StudentLayout>
      <Outlet />
    </StudentLayout>
  );
}
