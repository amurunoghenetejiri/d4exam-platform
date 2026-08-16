import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { SchoolResultHeader } from "@/components/brand/SchoolResultHeader";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/results")({
  head: () => ({ meta: [{ title: "My Results — D4EXAM" }] }),
  component: Page,
});

type ResultRow = {
  id: string;
  exam_id: string;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  grade: string | null;
  pass_fail: string | null;
  status: string;
  security_review_status?: string | null;
  released_at: string | null;
  created_at: string | null;
  examinations: { title: string; courses: { code: string; name: string } | null } | null;
};

function Page() {
  const { data: student, isLoading } = useStudentContext();

  const resultsQ = useQuery({
    queryKey: ["student-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      if (!student?.studentId) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select("id, exam_id, total_score, max_score, percentage, grade, pass_fail, status, security_review_status, released_at, created_at, examinations(title, courses(code, name))")
        .eq("student_id", student.studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  if (isLoading || resultsQ.isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
      </div>
    );
  }

  const rows = resultsQ.data ?? [];

  return (
    <>
      <PageHeader title="My Results" description="Results of exams you have written. Held results stay hidden until the examination officer releases them." />
      <SchoolResultHeader />
      {rows.length === 0 ? (
        <EmptyState title="No results yet" description="After you submit an exam, your result appears here once the officer releases it." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const held = r.status === "pending" || !r.released_at;
            const published = r.status === "published" || Boolean(r.released_at);
            return (
              <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{r.examinations?.title ?? "Exam"}</p>
                    <p className="text-xs text-slate-500">
                      {r.examinations?.courses?.code} — {r.examinations?.courses?.name}
                    </p>
                    {held ? (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Result is being held by the examination officer. You will see your score when it is released.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {r.percentage != null ? `${Math.round(Number(r.percentage))}%` : "—"}
                        {r.grade ? ` · Grade ${r.grade}` : ""}
                        {r.pass_fail ? ` · ${r.pass_fail}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={held ? "Held" : published ? "Released" : String(r.status)} />
                    {published && (
                      <Button asChild size="sm" className="h-8 px-2.5 text-xs font-semibold">
                        <Link to="/student/results/$id" params={{ id: r.id }}>
                          View result <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
