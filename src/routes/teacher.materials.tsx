import { createFileRoute } from "@tanstack/react-router";
import { CourseMaterialsPanel } from "@/components/materials/CourseMaterialsPanel";
import { EmptyState } from "@/components/dashboard/kit";
import { useTeacherContext } from "@/lib/teacher";
import { shortDisplayName } from "@/lib/utils";

export const Route = createFileRoute("/teacher/materials")({
  head: () => ({
    meta: [
      { title: "Course materials — D4EXAM" },
      {
        name: "description",
        content: "Drop notes, assignments, and study resources for your courses.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!teacher) {
    return (
      <EmptyState
        title="Teacher profile not found"
        description="Contact School Admin to link your account."
      />
    );
  }

  const courses = (teacher.courses ?? []).map((c) => ({
    id: c.id,
    code: c.code ?? "",
    name: c.name ?? "Course",
  }));

  return (
    <CourseMaterialsPanel
      role="teacher"
      schoolId={teacher.schoolId}
      courses={courses}
      displayName={shortDisplayName(teacher.fullName || teacher.email || "Teacher")}
    />
  );
}
