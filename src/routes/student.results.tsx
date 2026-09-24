import { createFileRoute, Outlet, useChildMatches, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { SchoolResultHeader } from "@/components/brand/SchoolResultHeader";
import { useStudentContext } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { isOnlineNow } from "@/lib/offline-sync";

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
  exam_title?: string | null;
  course_code?: string | null;
  course_name?: string | null;
  assessment?: string | null;
};

function Page() {
  const childMatches = useChildMatches();
  if (childMatches.length > 0) {
    return <Outlet />;
  }
  return <ResultsList />;
}

/**
 * Load student results without fragile nested joins.
 * Nested examinations(courses(...)) often fails RLS/embedding and returns empty.
 */
async function fetchStudentResults(studentId: string): Promise<ResultRow[]> {
  // 1) Flat results query — most reliable under RLS
  const base = await supabase
    .from("results")
    .select(
      "id, exam_id, total_score, max_score, percentage, grade, pass_fail, status, security_review_status, released_at, created_at",
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (base.error) {
    console.warn("[student-results] base query", base.error.message);
  }

  let rows = (base.data ?? []) as ResultRow[];

  // 2) If empty, try without order (some policies choke on order)
  if (!rows.length && base.error) {
    const retry = await supabase
      .from("results")
      .select(
        "id, exam_id, total_score, max_score, percentage, grade, pass_fail, status, security_review_status, released_at, created_at",
      )
      .eq("student_id", studentId);
    if (!retry.error && retry.data?.length) {
      rows = retry.data as ResultRow[];
    }
  }

  if (!rows.length) return [];

  // 3) Enrich exam + course titles in a second query (avoids nested embed failures)
  const examIds = [...new Set(rows.map((r) => r.exam_id).filter(Boolean))];
  if (examIds.length) {
    const examsQ = await supabase
      .from("examinations")
      .select("id, title, course_id, assessment_type, courses(code, name)")
      .in("id", examIds);

    if (examsQ.error) {
      // courses embed may fail — fall back to examinations only
      const simple = await supabase
        .from("examinations")
        .select("id, title, course_id, assessment_type")
        .in("id", examIds);
      const byId = new Map(
        ((simple.data ?? []) as { id: string; title?: string; assessment_type?: string }[]).map(
          (e) => [e.id, e],
        ),
      );
      rows = rows.map((r) => {
        const e = byId.get(r.exam_id);
        return {
          ...r,
          exam_title: e?.title ?? null,
          assessment: e?.assessment_type ?? null,
        };
      });
    } else {
      type ExamRow = {
        id: string;
        title?: string;
        assessment_type?: string;
        courses?: { code?: string; name?: string } | null;
      };
      const byId = new Map(((examsQ.data ?? []) as ExamRow[]).map((e) => [e.id, e]));
      rows = rows.map((r) => {
        const e = byId.get(r.exam_id);
        return {
          ...r,
          exam_title: e?.title ?? null,
          course_code: e?.courses?.code ?? null,
          course_name: e?.courses?.name ?? null,
          assessment: e?.assessment_type ?? null,
        };
      });
    }
  }

  return rows;
}

function ResultsList() {
  const { data: student, isLoading, isError, error } = useStudentContext();
  const { data: user } = useSessionUser();
  const navigate = useNavigate();

  const resultsQ = useQuery({
    queryKey: ["student-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 5_000,
    refetchInterval: isOnlineNow() ? 20_000 : false,
    retry: 2,
    queryFn: async () => {
      if (!student?.studentId) return [] as ResultRow[];
      return fetchStudentResults(student.studentId);
    },
  });

  useRealtimeInvalidate(
    `student-results-${student?.studentId ?? "x"}`,
    student?.studentId
      ? [{ table: "results", filter: `student_id=eq.${student.studentId}` }]
      : [],
    [["student-results", student?.studentId]],
    Boolean(student?.studentId),
  );

  if (isLoading || (student?.studentId && resultsQ.isLoading)) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading results…
      </div>
    );
  }

  if (!student) {
    return (
      <>
        <PageHeader title="My Results" description="Your examination and test results." />
        <EmptyState
          title="Student profile not linked"
          description={
            isError
              ? (error as Error)?.message || "Could not load your student profile. Contact school admin."
              : "Your account is not linked to a student record yet. Contact your school admin."
          }
        />
      </>
    );
  }

  if (resultsQ.isError) {
    return (
      <>
        <PageHeader title="My Results" description="Your examination and test results." />
        <EmptyState
          title="Could not load results"
          description={(resultsQ.error as Error)?.message || "Please check your connection and try again."}
        />
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="outline" onClick={() => void resultsQ.refetch()}>
            Retry
          </Button>
        </div>
      </>
    );
  }

  const rows = resultsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="My Results"
        description="Results of exams and tests you have written. Held results stay hidden until the examination officer releases them."
      />
      <SchoolResultHeader />
      {rows.length === 0 ? (
        <EmptyState
          title="No results yet"
          description="After you submit an exam or test, your result appears here once it is saved. Scores stay hidden until the officer releases them."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const st = (r.status || "").toLowerCase();
            const published = st === "published" || Boolean(r.released_at);
            const flagged = (r.security_review_status || "").toLowerCase() === "flagged";
            const terminated =
              st === "terminated" ||
              String(r.security_review_status || "").toLowerCase() === "terminated";
            const statusLabel = terminated
              ? "Terminated"
              : published
                ? "Released"
                : flagged
                  ? "Pending officer review"
                  : st === "pending"
                    ? "Result held"
                    : st === "processing"
                      ? "Processing"
                      : String(r.status || "Pending");
            const targetId = r.id || r.exam_id;
            const title = r.exam_title || "Exam";
            const courseLine = [r.course_code, r.course_name].filter(Boolean).join(" — ");
            const typeLabel =
              r.assessment === "test" || r.assessment === "Test"
                ? "Test"
                : r.assessment
                  ? "Exam"
                  : null;
            return (
              <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      {title}
                      {typeLabel ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {typeLabel}
                        </span>
                      ) : null}
                    </p>
                    {courseLine ? <p className="text-xs text-slate-500">{courseLine}</p> : null}
                    {terminated ? (
                      <p className="mt-1 text-xs font-semibold text-red-700">
                        This examination was terminated. Scores are not released.
                      </p>
                    ) : published ? (
                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {r.percentage != null ? `${Math.round(Number(r.percentage))}%` : "—"}
                        {r.total_score != null && r.max_score != null
                          ? ` · ${r.total_score}/${r.max_score}`
                          : r.total_score != null
                            ? ` · Score ${r.total_score}`
                            : ""}
                        {r.grade ? ` · Grade ${r.grade}` : ""}
                        {r.pass_fail ? ` · ${r.pass_fail}` : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Result is held pending officer release. Scores stay hidden until released.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={statusLabel} />
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-2.5 text-xs font-semibold"
                      variant={published ? "default" : "outline"}
                      onClick={() => {
                        void navigate({
                          to: "/student/results/$id",
                          params: { id: targetId },
                        });
                      }}
                    >
                      {published ? "View result" : "View status"}{" "}
                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
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
