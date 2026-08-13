import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/results")({
  head: () => ({
    meta: [
      { title: "My Results — D4EXAM" },
      {
        name: "description",
        content: "Published scores and results still under review.",
      },
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
  correct_count: number | null;
  wrong_count: number | null;
  unanswered_count: number | null;
  status: string;
  security_review_status: string | null;
  released_at: string | null;
  created_at: string | null;
  examinations: { title: string; courses: { code: string } | null } | null;
};

type AttemptRow = {
  exam_id: string;
  status: string;
  submitted_at: string | null;
  percentage: number | null;
  score: number | null;
};

function Page() {
  const { data: student, isLoading } = useStudentContext();

  const resultsQ = useQuery({
    queryKey: ["student-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!student) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, total_score, percentage, grade, pass_fail, correct_count, wrong_count, unanswered_count, status, security_review_status, released_at, created_at, examinations(title, courses(code))",
        )
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["student-result-attempts", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      if (!student) return [] as AttemptRow[];
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("exam_id, status, submitted_at, percentage, score")
        .eq("student_id", student.studentId)
        .in("status", ["submitted", "terminated", "flagged"]);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!student) {
    return <EmptyState title="Student profile not found" description="Contact School Admin." />;
  }

  const rows = resultsQ.data ?? [];
  const published = rows.filter((r) => r.status === "published");
  const pending = rows.filter((r) => r.status !== "published");
  const resultExamIds = new Set(rows.map((r) => r.exam_id));
  const submittedWithoutResult = (attemptsQ.data ?? []).filter(
    (a) => !resultExamIds.has(a.exam_id),
  );
  const attemptExamIds = new Set((attemptsQ.data ?? []).map((a) => a.exam_id));

  return (
    <>
      <PageHeader
        title="My Results"
        description={`${student.matric ?? ""} · Instant scores show when the teacher set “immediate” release; otherwise they appear after officer review`}
      />

      <SectionCard title={`Published results (${published.length})`}>
        {resultsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : published.length === 0 ? (
          <EmptyState
            title="No published results yet"
            description="When your scores are released, they appear here with grade and percentage."
          />
        ) : (
          <ul className="space-y-3">
            {published.map((r) => (
              <ResultCard key={r.id} r={r} />
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard title={`Under review (${pending.length + submittedWithoutResult.length})`}>
          {pending.length === 0 && submittedWithoutResult.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing waiting for review. Submitted exams show here until results are released.
            </p>
          ) : (
            <ul className="space-y-3">
              {pending.map((r) => (
                <ResultCard key={r.id} r={r} pending />
              ))}
              {submittedWithoutResult.map((a) => (
                <li
                  key={a.exam_id}
                  className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Submitted examination</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {a.submitted_at
                          ? `Submitted ${new Date(a.submitted_at).toLocaleString()}`
                          : "Submitted"}
                        {a.percentage != null ? ` · Provisional ${a.percentage}%` : ""}
                      </p>
                    </div>
                    <StatusBadge status="pending review" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {attemptExamIds.size > 0 && (
        <p className="mt-4 text-center text-xs text-slate-400">
          You have completed {attemptExamIds.size} examination
          {attemptExamIds.size === 1 ? "" : "s"}. Completed exams no longer appear under “Available
          now”.
        </p>
      )}
    </>
  );
}

function ResultCard({ r, pending }: { r: ResultRow; pending?: boolean }) {
  return (
    <li
      className={`rounded-xl border p-3.5 ${
        pending ? "border-amber-100 bg-amber-50/40" : "border-slate-100"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">
            {r.examinations?.courses?.code ?? "—"} · {r.examinations?.title ?? "Examination"}
          </p>
          {r.status === "published" ? (
            <>
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
            </>
          ) : (
            <p className="mt-1 text-xs text-amber-800">
              Your script was submitted. Score is hidden until the teacher or examination officer
              releases results.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={r.status === "published" ? "published" : "under review"} />
          {r.security_review_status && (
            <span className="text-[10px] font-semibold uppercase text-slate-500">
              Security: {r.security_review_status.replaceAll("_", " ")}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
