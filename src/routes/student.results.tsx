import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/kit";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/results")({
  head: () => ({
    meta: [
      { title: "My Results — D4EXAM" },
      { name: "description", content: "Your examination results." },
    ],
  }),
  component: Page,
});

type ResultRow = {
  id: string;
  exam_id: string;
  total_score: number | null;
  percentage: number | null;
  grade: string | null;
  pass_fail: string | null;
  status: string;
  released_at: string | null;
  created_at: string | null;
  examinations: {
    title: string;
    courses: { code: string; name: string } | null;
  } | null;
};

function Page() {
  const { data: student, isLoading } = useStudentContext();

  const resultsQ = useQuery({
    queryKey: ["student-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 20_000,
    refetchInterval: 45_000,
    queryFn: async () => {
      if (!student) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, total_score, percentage, grade, pass_fail, status, released_at, created_at, examinations(title, courses(code, name))",
        )
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!student) {
    return <EmptyState title="Student profile not found" description="Contact School Admin." />;
  }

  const rows = resultsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="My Results"
        description={`${student.fullName || student.matric || ""} · ${student.sessionName || "Session"} · ${student.semesterName || "Semester"}`}
      />

      {resultsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading results…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No results yet"
          description="After you submit an exam, each subject appears here. Open View Result to see your score breakdown."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const isPub = (r.status || "").toLowerCase() === "published";
            const code = r.examinations?.courses?.code ?? "—";
            const name = r.examinations?.courses?.name ?? r.examinations?.title ?? "Examination";
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-slate-900">
                    {code} · {name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.examinations?.title ?? ""}
                    {student.sessionName ? ` · ${student.sessionName}` : ""}
                    {student.semesterName ? ` · ${student.semesterName}` : ""}
                  </p>
                  {isPub && (
                    <p className="mt-1 text-sm font-bold text-primary">
                      {r.percentage != null ? `${r.percentage}%` : "—"}
                      {r.grade ? ` · Grade ${r.grade}` : ""}
                      {r.pass_fail ? ` · ${r.pass_fail}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={isPub ? "published" : "pending"} />
                  <Button size="sm" className="font-semibold" asChild>
                    <Link to="/student/results/$id" params={{ id: r.id }}>
                      View Result
                    </Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
