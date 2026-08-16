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

type AttemptMeta = {
  id: string;
  status: string | null;
  started_at: string | null;
  submitted_at: string | null;
  answers: Record<string, number> | null;
  metadata: {
    score?: {
      correct?: number;
      wrong?: number;
      unanswered?: number;
      totalScore?: number;
      maxMarks?: number;
      percentage?: number;
      grade?: string;
      passFail?: string;
    };
    total?: number;
    answered?: number;
  } | null;
};

function gradeLabel(g: string | null) {
  if (!g) return "—";
  const u = g.toUpperCase();
  if (u === "A") return "A (Excellent)";
  if (u === "B") return "B (Very Good)";
  if (u === "C") return "C (Good)";
  if (u === "D") return "D (Fair)";
  if (u === "E") return "E (Pass)";
  if (u === "F") return "F (Fail)";
  return g;
}

function formatDurationMs(ms: number | null): string {
  if (ms == null || ms < 0 || !Number.isFinite(ms)) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function ScoreRing({
  pct,
  score,
  maxMarks,
}: {
  pct: number;
  score: string;
  maxMarks: string;
}) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative mx-auto grid h-40 w-40 place-items-center sm:h-48 sm:w-48">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 140 140" aria-hidden>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="#2563eb"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="relative z-10 px-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Score</p>
        <p className="text-4xl font-black leading-none text-primary sm:text-5xl">
          {Math.round(clamped)}%
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-600 sm:text-sm">
          {score} / {maxMarks}
        </p>
      </div>
    </div>
  );
}

/** Load result by result id OR exam id — always scoped to this student. */
async function fetchOwnedResult(
  paramId: string,
  studentId: string,
): Promise<ResultRow | null> {
  const select =
    `id, exam_id, student_id, attempt_id, total_score, max_score, percentage, grade, pass_fail,
     correct_count, wrong_count, unanswered_count, status, security_review_status,
     released_at, created_at,
     examinations(title, duration_minutes, scheduled_start, courses(code, name))`;

  const byId = await supabase
    .from("results")
    .select(select)
    .eq("id", paramId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (byId.data) return byId.data as ResultRow;

  // Fallback: param may be exam_id (from examinations list when result id unknown)
  const byExam = await supabase
    .from("results")
    .select(select)
    .eq("exam_id", paramId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byExam.error) throw byExam.error;
  return (byExam.data as ResultRow | null) ?? null;
}

function ResultDetailPage() {
  const { id } = Route.useParams();
  const { data: student, isLoading: sLoading } = useStudentContext();

  useRealtimeInvalidate(
    `student-result-detail-${id}-${student?.studentId ?? "x"}`,
    student?.studentId
      ? [{ table: "results", filter: `student_id=eq.${student.studentId}` }]
      : [],
    [["student-result-detail", id, student?.studentId]],
    Boolean(student?.studentId && id),
  );

  const resultQ = useQuery({
    queryKey: ["student-result-detail", id, student?.studentId],
    enabled: Boolean(id && student?.studentId),
    staleTime: 10_000,
    queryFn: async () => {
      if (!student) return null;
      return fetchOwnedResult(id, student.studentId);
    },
  });

  const attemptQ = useQuery({
    queryKey: [
      "student-result-attempt",
      resultQ.data?.exam_id,
      resultQ.data?.attempt_id,
      student?.studentId,
    ],
    enabled: Boolean(resultQ.data?.exam_id && student?.studentId),
    queryFn: async () => {
      if (!student || !resultQ.data) return null;
      // Prefer attempt_id on the result row when present
      if (resultQ.data.attempt_id) {
        const { data, error } = await supabase
          .from("exam_attempts")
          .select("id, status, started_at, submitted_at, answers, metadata")
          .eq("id", resultQ.data.attempt_id)
          .eq("student_id", student.studentId)
          .maybeSingle();
        if (!error && data) return data as AttemptMeta;
      }
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, status, started_at, submitted_at, answers, metadata")
        .eq("exam_id", resultQ.data.exam_id)
        .eq("student_id", student.studentId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("attempt load", error);
        return null;
      }
      return data as AttemptMeta | null;
    },
  });

  if (sLoading || resultQ.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading result…
      </div>
    );
  }

  if (!student) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-bold text-slate-900">Student profile not found</p>
        <Button className="mt-4" asChild>
          <Link to="/student/results">Back</Link>
        </Button>
      </div>
    );
  }

  const r = resultQ.data;
  if (!r) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <SchoolResultHeader schoolId={student.schoolId} centered className="justify-center" />
        <p className="mt-4 font-bold text-slate-900">Result not found</p>
        <p className="mt-2 text-sm text-slate-500">
          This result does not exist for your account, or it has not been saved yet after submission.
        </p>
        <Button className="mt-6" variant="outline" asChild>
          <Link to="/student/results">Back to My Results</Link>
        </Button>
      </div>
    );
  }

  if (r.student_id && r.student_id !== student.studentId) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="font-bold text-red-900">Access denied</p>
        <p className="mt-2 text-sm text-red-800">You cannot view another student’s result.</p>
        <Button className="mt-6" variant="outline" asChild>
          <Link to="/student/results">Back</Link>
        </Button>
      </div>
    );
  }

  const statusLower = (r.status || "").toLowerCase();
  const isPub = statusLower === "published" || Boolean(r.released_at);
  const isHeld =
    !isPub &&
    (statusLower === "pending" ||
      statusLower === "held" ||
      statusLower === "processing" ||
      !r.released_at);
  const isPending = statusLower === "processing" || statusLower === "pending";

  const metaScore = attemptQ.data?.metadata?.score;
  const pass = ((r.pass_fail || metaScore?.passFail || "") as string).toLowerCase() === "pass";
  const pct = Number(r.percentage ?? metaScore?.percentage ?? 0);
  const correct = r.correct_count ?? metaScore?.correct ?? 0;
  const wrong = r.wrong_count ?? metaScore?.wrong ?? 0;
  const unanswered = r.unanswered_count ?? metaScore?.unanswered ?? 0;
  const answeredFromAnswers = attemptQ.data?.answers
    ? Object.keys(attemptQ.data.answers).length
    : null;
  const questionsAnswered =
    answeredFromAnswers ?? attemptQ.data?.metadata?.answered ?? correct + wrong;

  const answeredSum = correct + wrong + unanswered;
  const metaTotal = attemptQ.data?.metadata?.total ?? 0;
  const totalQ = answeredSum > 0 ? answeredSum : Number(metaTotal);
  const totalScore = r.total_score ?? metaScore?.totalScore ?? correct;
  const maxMarks =
    r.max_score ?? metaScore?.maxMarks ?? (totalQ > 0 ? totalQ : totalScore);
  const scoreText = String(totalScore);
  const maxText = String(maxMarks);
  const grade = r.grade || metaScore?.grade || null;

  const courseCode = r.examinations?.courses?.code ?? "—";
  const courseName = r.examinations?.courses?.name ?? r.examinations?.title ?? "Examination";
  const examTitle = r.examinations?.title || `${courseCode} – ${courseName}`;
  const dateWritten =
    attemptQ.data?.submitted_at || r.released_at || r.created_at;
  const durationMin = r.examinations?.duration_minutes;

  let timeUsedMs: number | null = null;
  if (attemptQ.data?.started_at && attemptQ.data?.submitted_at) {
    const a = new Date(attemptQ.data.started_at).getTime();
    const b = new Date(attemptQ.data.submitted_at).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) timeUsedMs = b - a;
  }

  const securityRaw = (r.security_review_status || "pending").toLowerCase();
  const security =
    securityRaw === "clear" || securityRaw === "pending"
      ? "CLEAR"
      : (r.security_review_status || "—").replaceAll("_", " ").toUpperCase();

  const statusBanner = isPub
    ? { label: "Released", className: "text-emerald-600" }
    : isPending
      ? { label: "Result Pending", className: "text-amber-700" }
      : { label: "Result Held", className: "text-amber-700" };

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-10 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <SchoolResultHeader schoolId={student.schoolId} size="lg" />
          <p className="mt-2 text-[11px] font-semibold text-slate-400 sm:mt-3 sm:text-xs">
            <Link to="/student" className="hover:text-primary">
              Dashboard
            </Link>{" "}
            ›{" "}
            <Link to="/student/results" className="hover:text-primary">
              My Results
            </Link>{" "}
            › <span className="text-primary">Result</span>
          </p>
          <h1 className="mt-1 text-base font-extrabold text-primary sm:text-xl">
            {courseCode} · {courseName}
          </h1>
          <p className="text-sm font-semibold text-slate-800">{examTitle}</p>
          <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">
            {dateWritten
              ? new Date(dateWritten).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "—"}
            {" · "}
            <span className={cn("font-bold", statusBanner.className)}>
              {statusBanner.label}
            </span>
          </p>
        </div>
        {isPub && (
          <Button
            variant="outline"
            size="sm"
            className="w-full font-semibold text-primary sm:w-auto"
            onClick={() => window.print()}
          >
            <Download className="mr-2 h-4 w-4" />
            Download Result
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-3 sm:p-4 sm:grid-cols-3 lg:grid-cols-4">
        <Info icon={User} label="Student name" value={student.fullName || "—"} bold />
        <Info icon={Hash} label="Matric number" value={student.matric || "—"} />
        <Info icon={Building2} label="Department" value={student.departmentName || "—"} />
        <Info icon={Building2} label="Faculty / College" value={student.facultyName || "—"} />
        <Info icon={GraduationCap} label="Level" value={student.levelName || "—"} />
        <Info icon={CalendarDays} label="Session" value={student.sessionName || "—"} />
        <Info icon={CalendarDays} label="Semester" value={student.semesterName || "—"} />
        <Info icon={Building2} label="School" value={student.schoolName || "—"} />
      </div>

      {!isPub ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700 sm:h-14 sm:w-14">
            <Clock className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <p className="text-base font-bold text-amber-900 sm:text-lg">
            {isPending ? "Result Pending" : "Result Held"}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-amber-800">
            {isPending
              ? "Your examination was submitted successfully. Scoring is still processing or awaiting officer review. Scores are hidden until the result is released."
              : "Your result is held pending release by the Examination Officer. When they release results for this subject, your score, grade, and breakdown will appear here automatically."}
          </p>
          <p className="mt-3 text-xs font-semibold text-amber-700">
            Exam: {examTitle} · Course: {courseCode}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button variant="outline" asChild>
              <Link to="/student/results">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Results
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/student/examinations">My Examinations</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-6 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="flex flex-col items-center justify-center gap-2 py-2 sm:gap-3">
              <ScoreRing pct={pct} score={scoreText} maxMarks={maxText} />
              <p className="text-sm font-bold text-slate-700">Grade: {gradeLabel(grade)}</p>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white",
                  pass ? "bg-emerald-500" : "bg-red-500",
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {pass ? "PASSED" : "FAILED"}
              </span>
              <p className={cn("text-sm font-semibold", pass ? "text-emerald-600" : "text-red-600")}>
                {pass ? "Excellent Performance!" : "Keep practising — you can improve."}
              </p>
            </div>

            <div className="space-y-0 divide-y divide-slate-100 text-sm">
              <MetaRow icon={FileText} label="Exam Title" value={examTitle} />
              <MetaRow icon={FileText} label="Course" value={`${courseCode} – ${courseName}`} />
              <MetaRow icon={Building2} label="Department" value={student.departmentName || "—"} />
              <MetaRow icon={GraduationCap} label="Level" value={student.levelName || "—"} />
              <MetaRow icon={CalendarDays} label="Session" value={student.sessionName || "—"} />
              <MetaRow icon={CalendarDays} label="Semester" value={student.semesterName || "—"} />
              <MetaRow
                icon={CalendarDays}
                label="Date written"
                value={
                  dateWritten
                    ? new Date(dateWritten).toLocaleDateString(undefined, { dateStyle: "medium" })
                    : "—"
                }
              />
              <MetaRow
                icon={Clock}
                label="Duration (allowed)"
                value={durationMin ? `${durationMin} minutes` : "—"}
              />
              <MetaRow icon={Clock} label="Time used" value={formatDurationMs(timeUsedMs)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard icon={FileText} label="Total questions" value={String(totalQ || "—")} tone="blue" />
            <StatCard
              icon={ListChecks}
              label="Questions answered"
              value={String(questionsAnswered)}
              tone="blue"
            />
            <StatCard icon={CheckCircle2} label="Correct" value={String(correct)} tone="green" />
            <StatCard icon={XCircle} label="Wrong" value={String(wrong)} tone="red" />
            <StatCard icon={MinusCircle} label="Unanswered" value={String(unanswered)} tone="amber" />
            <StatCard icon={Percent} label="Percentage" value={`${Math.round(pct)}%`} tone="purple" />
          </div>

          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-sm font-extrabold text-slate-900">Performance summary</h2>
              <ul className="mt-3 space-y-2 text-sm sm:mt-4 sm:space-y-2.5">
                <InfoRow label="Total questions" value={String(totalQ || "—")} />
                <InfoRow label="Questions answered" value={String(questionsAnswered)} />
                <InfoRow label="Correct" value={String(correct)} />
                <InfoRow label="Wrong" value={String(wrong)} />
                <InfoRow label="Unanswered" value={String(unanswered)} />
                <InfoRow label="Score" value={`${scoreText} / ${maxText}`} />
                <InfoRow label="Percentage" value={`${Math.round(pct)}%`} />
                <InfoRow label="Grade" value={gradeLabel(grade)} />
                <InfoRow label="Time used" value={formatDurationMs(timeUsedMs)} />
                <InfoRow
                  label="Result status"
                  value={pass ? "PASSED" : "FAILED"}
                  badge={pass ? "pass" : "fail"}
                />
                <InfoRow
                  label="Security review"
                  value={security}
                  badge={security === "CLEAR" ? "clear" : "warn"}
                />
              </ul>
            </div>

            <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-sm font-extrabold text-slate-900">Result summary</h2>
              <div className="mt-3 flex flex-1 flex-col items-center justify-center sm:mt-4">
                <div className="w-full max-w-[180px] sm:max-w-[200px]">
                  <ScoreRing pct={pct} score={scoreText} maxMarks={maxText} />
                </div>
                <p className="mt-3 text-center text-sm leading-relaxed text-slate-500 sm:mt-4">
                  {pass
                    ? "Great job! You have successfully completed the examination. Keep up the good work."
                    : "You did not meet the pass mark this time. Review the course materials and prepare for the next opportunity."}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-slate-400 sm:mt-4 sm:text-xs">
                <ShieldCheck className="h-3.5 w-3.5" />
                Integrity monitored · {student.schoolName || "School"} · D4EXAM
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" className="font-semibold" asChild>
          <Link to="/student/examinations">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Examinations
          </Link>
        </Button>
        <Button variant="outline" className="font-semibold" asChild>
          <Link to="/student/results">All results</Link>
        </Button>
        <Button variant="outline" className="font-semibold" asChild>
          <Link to="/student/history">Exam history</Link>
        </Button>
      </div>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
  bold,
}: {
  icon?: typeof User;
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[10px]">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </p>
      <p className={cn("truncate text-xs text-slate-900 sm:text-sm", bold && "font-bold")}>
        {value}
      </p>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2 sm:py-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-primary sm:h-8 sm:w-8">
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-400 sm:text-xs">{label}</p>
        <p className="text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  className,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  tone: "green" | "red" | "amber" | "blue" | "purple";
  className?: string;
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
    blue: "bg-blue-50 text-primary border-blue-100",
    purple: "bg-violet-50 text-violet-700 border-violet-100",
  };
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2.5 shadow-sm sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3",
        tones[tone],
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
      <div className="min-w-0">
        <p className="text-base font-extrabold leading-none sm:text-lg">{value}</p>
        <p className="mt-0.5 text-[10px] font-semibold opacity-80 sm:text-[11px]">{label}</p>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: "pass" | "fail" | "clear" | "warn";
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      {badge ? (
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase",
            badge === "pass" || badge === "clear"
              ? "bg-emerald-100 text-emerald-700"
              : badge === "fail"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-800",
          )}
        >
          {value}
        </span>
      ) : (
        <span className="font-semibold text-slate-900">{value}</span>
      )}
    </li>
  );
}
