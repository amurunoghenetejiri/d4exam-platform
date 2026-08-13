import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/results")({
  head: () => ({
    meta: [
      { title: "My Results — D4EXAM" },
      { name: "description", content: "Approved and pending results across your academic session." },
    ],
  }),
  component: Page,
});

type ResultRow = {
  id: string;
  total_score: number | null;
  percentage: number | null;
  grade: string | null;
  pass_fail: string | null;
  correct_count: number | null;
  wrong_count: number | null;
  unanswered_count: number | null;
  status: string;
  security_review_status: string | null;
  examinations: { title: string; courses: { code: string } | null } | null;
};

function Page() {
  const { data: student, isLoading } = useStudentContext();

  const resultsQ = useQuery({
    queryKey: ["student-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      if (!student) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, total_score, percentage, grade, pass_fail, correct_count, wrong_count, unanswered_count, status, security_review_status, examinations(title, courses(code))",
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
    return (
      <EmptyState title="Student profile not found" description="Contact School Admin." />
    );
  }

  const rows = resultsQ.data ?? [];
  // Students only see published (RLS) — also show pending security if policy allows
  const visible = rows.filter((r) => r.status === "published" || r.status === "pending");

  return (
    <>
      <PageHeader
        title="My Results"
        description={`${student.matric ?? ""} · Scores appear when released by the Examination Officer`}
      />

      <SectionCard title={`Results (${visible.length})`}>
        {resultsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : visible.length === 0 ? (
          <EmptyState
            title="No results yet"
            description="After you submit an exam and security review is completed, published results appear here."
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-slate-100 p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {r.examinations?.courses?.code ?? "—"} · {r.examinations?.title ?? "Examination"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Score {r.total_score ?? "—"}
                      {r.percentage != null ? ` · ${r.percentage}%` : ""}
                      {r.grade ? ` · Grade ${r.grade}` : ""}
                      {r.pass_fail ? ` · ${r.pass_fail}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Correct {r.correct_count ?? 0} · Wrong {r.wrong_count ?? 0} · Unanswered{" "}
                      {r.unanswered_count ?? 0}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={r.status} />
                    {r.security_review_status && (
                      <span className="text-[10px] font-semibold uppercase text-slate-500">
                        Security: {r.security_review_status.replaceAll("_", " ")}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
