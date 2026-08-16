import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";

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
  released_at: string | null;
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

type ExamLite = {
  id: string;
  title: string;
  courses: { code: string; name: string } | null;
};

function Page() {
  const { data: student, isLoading } = useStudentContext();

  useRealtimeInvalidate(
    `student-history-${student?.studentId ?? "x"}`,
    student?.studentId
      ? [
          { table: "results", filter: `student_id=eq.${student.studentId}` },
          { table: "exam_attempts", filter: `student_id=eq.${student.studentId}` },
        ]
      : [],
    [
      ["student-history-results", student?.studentId],
      ["student-history-attempts", student?.studentId],
    ],
    Boolean(student?.studentId),
  );

  const resultsQ = useQuery({
    queryKey: ["student-history-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, percentage, grade, pass_fail, status, released_at, created_at, examinations(title, duration_minutes, courses(code, name))",
        )
        .eq("student_id", student!.studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["student-history-attempts", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, status, submitted_at, started_at")
        .eq("student_id", student!.studentId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const examIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of attemptsQ.data ?? []) ids.add(a.exam_id);
    for (const r of resultsQ.data ?? []) ids.add(r.exam_id);
    return [...ids];
  }, [attemptsQ.data, resultsQ.data]);

  const examsQ = useQuery({
    queryKey: ["student-history-exams", examIds.join(",")],
    enabled: examIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, courses(code, name)")
        .in("id", examIds);
      if (error) throw error;
      return (data ?? []) as ExamLite[];
    },
  });

  const examById = useMemo(() => {
    const m = new Map<string, ExamLite>();
    for (const e of examsQ.data ?? []) m.set(e.id, e);
    return m;
  }, [examsQ.data]);

  const resultByExam = useMemo(() => {
    const m = new Map<string, ResultRow>();
    for (const r of resultsQ.data ?? []) m.set(r.exam_id, r);
    return m;
  }, [resultsQ.data]);

  if (isLoading || resultsQ.isLoading) {
    return <p className="text-sm text-slate-500">Loading history…</p>;
  }

  const rows = resultsQ.data ?? [];
  const attempts = attemptsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Exam History"
        description="All examinations you have written and their result status."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to="/student">
              <ArrowLeft className="mr-1 h-4 w-4" /> Dashboard
            </Link>
          </Button>
        }
      />

      <SectionCard title="Results">
        {rows.length === 0 ? (
          <EmptyState
            title="No history yet"
            description="After you submit an examination, it appears here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Exam</th>
                  <th className="py-2 pr-3">Course</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const published =
                    (r.status || "").toLowerCase() === "published" ||
                    Boolean(r.released_at);
                  return (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">
                        {r.examinations?.title ?? "Exam"}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">
                        {r.examinations?.courses?.code ?? "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {published
                          ? `${r.percentage != null ? `${Math.round(Number(r.percentage))}%` : "—"}${r.grade ? ` · ${r.grade}` : ""}`
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge status={published ? "Released" : "Held"} />
                      </td>
                      <td className="py-2.5">
                        <Button size="sm" variant="outline" className="font-semibold" asChild>
                          <Link to="/student/results/$id" params={{ id: r.id }}>
                            {published ? "View Result" : "View Status"}
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

      <SectionCard title="Attempts" className="mt-4">
        {attempts.length === 0 ? (
          <EmptyState title="No attempts recorded" />
        ) : (
          <ul className="space-y-2 text-sm">
            {attempts.map((a) => {
              const exam = examById.get(a.exam_id);
              const result = resultByExam.get(a.exam_id);
              const done = ["submitted", "terminated", "flagged"].includes(
                String(a.status).toLowerCase(),
              );
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">
                      {exam?.title ?? `Exam ${a.exam_id.slice(0, 8)}…`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {exam?.courses?.code ? `${exam.courses.code} · ` : ""}
                      {a.submitted_at
                        ? new Date(a.submitted_at).toLocaleString()
                        : a.started_at
                          ? new Date(a.started_at).toLocaleString()
                          : "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={a.status} />
                    {done && result && (
                      <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" asChild>
                        <Link to="/student/results/$id" params={{ id: result.id }}>
                          View Result
                        </Link>
                      </Button>
                    )}
                    {done && !result && (
                      <Button size="sm" variant="outline" className="h-8 text-xs font-semibold" asChild>
                        <Link to="/student/results/$id" params={{ id: a.exam_id }}>
                          View Result
                        </Link>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
