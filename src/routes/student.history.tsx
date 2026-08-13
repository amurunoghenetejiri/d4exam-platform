import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, ArrowLeft } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/history")({
  head: () => ({
    meta: [{ title: "Exam History — D4EXAM" }],
  }),
  component: Page,
});

type ResultRow = {
  id: string;
  exam_id: string;
  percentage: number | null;
  grade: string | null;
  pass_fail: string | null;
  status: string;
  created_at: string | null;
  examinations: {
    title: string;
    duration_minutes?: number;
    courses: { code: string; name: string } | null;
  } | null;
};

type AttemptRow = {
  id: string;
  exam_id: string;
  status: string;
  submitted_at: string | null;
  started_at: string | null;
};

function Page() {
  const { data: student, isLoading } = useStudentContext();

  const resultsQ = useQuery({
    queryKey: ["student-history-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      if (!student?.studentId) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, percentage, grade, pass_fail, status, created_at, examinations(title, duration_minutes, courses(code, name))",
        )
        .eq("student_id", student.studentId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["student-history-attempts", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      if (!student?.studentId) return [] as AttemptRow[];
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, status, submitted_at, started_at")
        .eq("student_id", student.studentId)
        .in("status", ["submitted", "terminated", "flagged"])
        .order("submitted_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading history…</p>;

  const results = resultsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Exam History"
        description="Completed examinations and results archive. Records are kept permanently."
        actions={
          <Button variant="outline" className="font-semibold" asChild>
            <Link to="/student">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Dashboard
            </Link>
          </Button>
        }
      />

      <SectionCard title={`Completed (${results.length})`} description="All written exams and scores">
        {resultsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : results.length === 0 ? (
          <EmptyState
            icon={History}
            title="No history yet"
            description="When you complete examinations, they are archived here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-slate-500">
                  <th className="py-2 pr-2">Exam</th>
                  <th className="py-2 pr-2">Course</th>
                  <th className="py-2 pr-2">Score</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const isPub = (r.status || "").toLowerCase() === "published";
                  return (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 font-semibold">
                        {r.examinations?.title ?? "Exam"}
                      </td>
                      <td className="py-2.5 pr-2 text-xs text-slate-600">
                        {r.examinations?.courses?.code ?? "—"}
                      </td>
                      <td className="py-2.5 pr-2">
                        {isPub
                          ? `${r.percentage != null ? `${Math.round(Number(r.percentage))}%` : "—"}${r.grade ? ` · ${r.grade}` : ""}`
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-2">
                        <StatusBadge status={isPub ? r.pass_fail || "published" : r.status} />
                      </td>
                      <td className="py-2.5 pr-2 text-xs text-slate-500">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2.5">
                        <Button size="sm" variant="outline" className="font-semibold" asChild>
                          <Link to="/student/results" search={{ id: r.id }}>
                            View
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="mt-4 text-xs text-slate-500">
        Attempts on record: {(attemptsQ.data ?? []).length}. History is never deleted from the
        dashboard archive.
      </div>
    </>
  );
}
