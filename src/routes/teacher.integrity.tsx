import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { useTeacherContext } from "@/lib/teacher";

export const Route = createFileRoute("/teacher/integrity")({
  head: () => ({
    meta: [
      { title: "Integrity — D4EXAM" },
      {
        name: "description",
        content: "Integrity events for examinations on your assigned courses.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return <EmptyState title="Teacher profile not found" description="Contact School Admin." />;
  }

  return (
    <>
      <PageHeader
        title="Integrity"
        description={`Events for exams on your ${teacher.courses.length} assigned course(s) · ${teacher.fullName}`}
      />

      <SectionCard title="Integrity events">
        <EmptyState
          title="No integrity events yet"
          description="When students sit locked-down exams on your courses, tab switches, fullscreen exits, and similar events will appear here once logged by the platform."
        />
      </SectionCard>
    </>
  );
}
