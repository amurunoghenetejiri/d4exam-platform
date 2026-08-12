import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useTeacherContext } from "@/lib/teacher";

export const Route = createFileRoute("/teacher/submissions")({
  head: () => ({
    meta: [{ title: "Submissions — D4EXAM" }],
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
        title="Submissions"
        description={`Student attempts on your assigned courses · ${teacher.fullName}`}
        actions={
          <Button className="font-semibold" asChild>
            <Link to="/teacher/marking">Open Marking Center</Link>
          </Button>
        }
      />
      <SectionCard title="Recent submissions">
        <EmptyState
          title="No submissions yet"
          description="When students sit officer-approved exams on your courses, their attempts will appear here for marking."
        />
      </SectionCard>
    </>
  );
}
