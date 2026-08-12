import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { useTeacherContext } from "@/lib/teacher";

export const Route = createFileRoute("/teacher/marking")({
  head: () => ({
    meta: [
      { title: "Marking Center — D4EXAM" },
      { name: "description", content: "Mark subjective answers for your assigned courses." },
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
        title="Marking Center"
        description={`Theory / essay marking for ${teacher.fullName}. Objective items auto-mark when attempts exist.`}
      />

      <SectionCard title="Scripts awaiting mark">
        <EmptyState
          title="Nothing to mark"
          description="When students submit theory or essay answers on your assigned courses, scripts will queue here."
        />
      </SectionCard>
    </>
  );
}
