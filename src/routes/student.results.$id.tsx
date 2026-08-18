import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Percent,
  FileText,
  Building2,
  GraduationCap,
  CalendarDays,
  Clock,
  ShieldCheck,
  User,
  Hash,
  Loader2,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolResultHeader } from "@/components/brand/SchoolResultHeader";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/results/$id")({
  head: () => ({
    meta: [
      { title: "Exam Result — D4EXAM" },
      { name: "description", content: "Your performance in this examination." },
    ],
  }),
  component: ResultDetailPage,
});

type ResultRow = {
  id: string;
  exam_id: string;
  student_id: string;
  attempt_id: string | null;
  total_score: number | null;
  max_score: number | null;
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
  examinations: {
    title: string;
    duration_minutes?: number;
    scheduled_start?: string | null;
    courses: { code: string; name: string } | null;
  } | null;
};

function ResultDetailPage() {
  const { id } = Route.useParams();
  const { data: student, isLoading: sLoading } = useStudentContext();

  useRealtimeInvalidate(
    `student-result-detail-${id}`,
    student?.studentId
      ? [{ table: "results", filter: `student_id=eq.${student.studentId}` }]
      : [],
    [["student-result-detail", id]],
    Boolean(student?.studentId),
  );

  const resultQ = useQuery({
    queryKey: ["student-result-detail", id, student?.studentId],
    enabled: Boolean(id && student?.studentId),
    queryFn: async () => {
      if (!student?.studentId) return null;
      let q = supabase
        .from("results")
        .select(
          `id, exam_id, student_id, attempt_id, total_score, max_score, percentage, grade, pass_fail,
           correct_count, wrong_count, unanswered_count, status, security_review_status,
           released_at, created_at, examinations(title, duration_minutes, scheduled_start, courses(code, name))`,
        )
        .eq("student_id", student.studentId);
      // id may be result id or exam id
      const byId = await q.eq("id", id).maybeSingle();
      if (byId.data) return byId.data as unknown as ResultRow;
      const byExam = await supabase
        .from("results")
        .select(
          `id, exam_id, student_id, attempt_id, total_score, max_score, percentage, grade, pass_fail,
           correct_count, wrong_count, unanswered_count, status, security_review_status,
           released_at, created_at, examinations(title, duration_minutes, scheduled_start, courses(code, name))`,
        )
        .eq("student_id", student.studentId)
        .eq("exam_id", id)
        .maybeSingle();
      return (byExam.data as unknown as ResultRow) ?? null;
    },
  });

  if (sLoading || resultQ.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading result…
      </div>
    );
  }

  const r = resultQ.data;
  if (!r) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-4 text-center">
        <p className="text-sm font-semibold text-slate-800">Result not found</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/student/results">Back to results</Link>
        </Button>
      </div>
    );
  }

  const statusLower = String(r.status || "").toLowerCase();
  const isTerminated =
    statusLower === "terminated" ||
    String(r.security_review_status || "").toLowerCase() === "terminated";
  const isPub = !isTerminated && (statusLower === "published" || Boolean(r.released_at));
  const isHeld =
    !isPub &&
    !isTerminated &&
    (statusLower === "pending" || statusLower === "held" || !r.released_at);
  const isPending = !isTerminated && (statusLower === "processing" || statusLower === "pending");

  const pct = r.percentage != null ? Math.round(Number(r.percentage)) : null;
  const pass = String(r.pass_fail || "").toLowerCase() === "pass";
  const course = r.examinations?.courses;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs font-semibold">
          <Link to="/student/results">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back
          </Link>
        </Button>
      </div>

      <SchoolResultHeader />

      {isTerminated ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center shadow-sm">
          <XCircle className="mx-auto h-10 w-10 text-red-600" />
          <p className="mt-2 text-base font-bold text-red-900 sm:text-lg">Exam terminated</p>
          <p className="mt-1 text-sm text-red-800">
            This examination attempt was terminated by the Examination Officer. Scores are not released for this paper.
          </p>
        </div>
      ) : !isPub ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm">
          <Clock className="mx-auto h-10 w-10 text-amber-600" />
          <p className="mt-2 text-base font-bold text-amber-900 sm:text-lg">
            {isPending ? "Result Pending" : "Result Held"}
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Your result is held pending officer release. Scores stay hidden until the Examination Officer publishes them.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">{course?.code ?? "—"}</p>
        <h1 className="mt-1 text-lg font-extrabold text-slate-900">{r.examinations?.title ?? "Examination"}</h1>
        {course?.name ? <p className="text-sm text-slate-500">{course.name}</p> : null}

        {isPub ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Score</p>
              <p className="text-lg font-extrabold tabular-nums text-slate-900">
                {r.total_score ?? "—"}/{r.max_score ?? "—"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase text-slate-500">%</p>
              <p className="text-lg font-extrabold tabular-nums text-slate-900">{pct != null ? `${pct}%` : "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Grade</p>
              <p className="text-lg font-extrabold text-slate-900">{r.grade || "—"}</p>
            </div>
            <div className={cn("rounded-lg p-3 text-center", pass ? "bg-emerald-50" : "bg-red-50")}>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Result</p>
              <p className={cn("text-lg font-extrabold", pass ? "text-emerald-800" : "text-red-800")}>
                {(r.pass_fail || "—").toUpperCase()}
              </p>
            </div>
          </div>
        ) : null}

        {isPub ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md bg-emerald-50 py-2">
              <p className="font-bold text-emerald-800">{r.correct_count ?? "—"}</p>
              <p className="text-emerald-700">Correct</p>
            </div>
            <div className="rounded-md bg-red-50 py-2">
              <p className="font-bold text-red-800">{r.wrong_count ?? "—"}</p>
              <p className="text-red-700">Wrong</p>
            </div>
            <div className="rounded-md bg-amber-50 py-2">
              <p className="font-bold text-amber-900">{r.unanswered_count ?? "—"}</p>
              <p className="text-amber-800">Blank</p>
            </div>
          </div>
        ) : null}

        <ul className="mt-4 space-y-1.5 text-sm">
          <MetaRow icon={ShieldCheck} label="Status" value={isTerminated ? "Terminated" : isPub ? "Released" : "Held"} />
          <MetaRow icon={CalendarDays} label="Submitted" value={r.created_at ? new Date(r.created_at).toLocaleString() : "—"} />
          {r.released_at ? (
            <MetaRow icon={CheckCircle2} label="Released" value={new Date(r.released_at).toLocaleString()} />
          ) : null}
        </ul>
      </div>

      <div className="flex justify-center">
        <Button asChild variant="outline" size="sm">
          <Link to="/student/results">Back to all results</Link>
        </Button>
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-2 text-slate-600">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="ml-auto text-sm font-semibold text-slate-900">{value}</span>
    </li>
  );
}
