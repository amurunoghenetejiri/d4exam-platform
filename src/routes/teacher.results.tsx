import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/teacher/results")({
  head: () => ({
    meta: [
      { title: "Results — D4EXAM" },
      {
        name: "description",
        content: "Completed examinations on your assigned courses.",
      },
    ],
  }),
  component: Page,
});

type ExamRow = {
  id: string;
  title: string;
  status: string;
  scheduled_end: string | null;
  courses: { code: string; name: string } | null;
};

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();

  const examsQ = useQuery({
    queryKey: ["teacher-completed-exams", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    queryFn: async () => {
      if (!teacher) return [] as ExamRow[];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, scheduled_end, courses(code, name)")
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds)
        .in("status", ["completed", "closed"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return <EmptyState title="Teacher profile not found" description="Contact School Admin." />;
  }

  const rows = examsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Results"
        description={`Completed exams on your courses · ${teacher.fullName}. Student score release is controlled by the Examination Officer.`}
      />

      <SectionCard title="Completed examinations">
        {examsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No completed examinations"
            description="When exams on your courses finish, they appear here. Detailed student scores depend on attempt tables once candidates sit exams."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">{r.title}</p>
                  <p className="text-xs text-slate-500">
                    {r.courses?.code} — {r.courses?.name}
                  </p>
                </div>
                <StatusBadge status={String(r.status).replaceAll("_", " ")} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
