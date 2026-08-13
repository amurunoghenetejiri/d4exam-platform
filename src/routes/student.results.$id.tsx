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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
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
  examinations: {
    title: string;
    duration_minutes?: number;
    scheduled_start?: string | null;
    courses: { code: string; name: string } | null;
  } | null;
};

type AttemptMeta = {
  id: string;
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
    <div className="relative mx-auto grid h-48 w-48 place-items-center sm:h-56 sm:w-56">
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
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Score</p>
        <p className="text-5xl font-black leading-none text-primary sm:text-[3.25rem]">
          {Math.round(clamped)}%
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {score} / {maxMarks}
        </p>
      </div>
    </div>
  );
}

async function fetchOwnedResult(
  paramId: string,
  studentId: string,
  schoolId: string,
): Promise<ResultRow | null> {
  const byId = await supabase
    .from("results")
    .select(
      `id, exam_id, student_id, total_score, percentage, grade, pass_fail,
       correct_count, wrong_count, unanswered_count, status, security_review_status,
       released_at, created_at,
       examinations(title, duration_minutes, scheduled_start, courses(code, name))`,
    )
    .eq("id", paramId)
    .eq("student_id", studentId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (byId.data) return byId.data as ResultRow;

  const byExam = await supabase
    .from("results")
    .select(
      `id, exam_id, student_id, total_score, percentage, grade, pass_fail,
       correct_count, wrong_count, unanswered_count, status, security_review_status,
       released_at, created_at,
       examinations(title, duration_minutes, scheduled_start, courses(code, name))`,
    )
    .eq("exam_id", paramId)
    .eq("student_id", studentId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (byExam.error) throw byExam.error;
  return (byExam.data as ResultRow | null) ?? null;
}

function ResultDetailPage() {
  const { id } = Route.useParams();
  const { data: student, isLoading: sLoading } = useStudentContext();

  const resultQ = useQuery({
    queryKey: ["student-result-detail", id, student?.studentId],
    enabled: Boolean(id && student?.studentId && student?.schoolId),
    staleTime: 15_000,
    queryFn: async () => {
      if (!student) return null;
      return fetchOwnedResult(id, student.studentId, student.schoolId);
    },
  });

  const attemptQ = useQuery({
    queryKey: ["student-result-attempt", resultQ.data?.exam_id, student?.studentId],
    enabled: Boolean(resultQ.data?.exam_id && student?.studentId),
    queryFn: async () => {
      if (!student || !resultQ.data) return null;
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, answers, metadata")
        .eq("exam_id", resultQ.data.exam_id)
        .eq("student_id", student.studentId)
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
        <Logo size="md" className="mx-auto justify-center" />
        <p className="mt-4 font-bold text-slate-900">Result not found</p>
        <p className="mt-2 text-sm text-slate-500">
          This result does not exist for your account, or it has not been saved yet.
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

  const isPub = (r.status || "").toLowerCase() === "published";
  const metaScore = attemptQ.data?.metadata?.score;
  const pass = ((r.pass_fail || metaScore?.passFail || "") as string).toLowerCase() === "pass";
  const pct = Number(r.percentage ?? metaScore?.percentage ?? 0);
  const correct = r.correct_count ?? metaScore?.correct ?? 0;
  const wrong = r.wrong_count ?? metaScore?.wrong ?? 0;
  const unanswered = r.unanswered_count ?? metaScore?.unanswered ?? 0;
  // Parentheses required: cannot mix ?? with || without them (breaks Vite/TanStack parse)
  const totalQ =
    correct + wrong + unanswered || Number(attemptQ.data?.metadata?.total ?? 0);
  const totalScore = r.total_score ?? metaScore?.totalScore ?? correct;
  const maxMarks = (metaScore?.maxMarks ?? totalQ) || totalScore;
  const scoreText = String(totalScore);
  const maxText = String(maxMarks);
  const grade = r.grade || metaScore?.grade || null;

  const courseCode = r.examinations?.courses?.code ?? "—";
  const courseName = r.examinations?.courses?.name ?? r.examinations?.title ?? "Examination";
  const examTitle = r.examinations?.title || `${courseCode} – ${courseName}`;
  const dateTaken = r.released_at || r.created_at;
  const durationMin = r.examinations?.duration_minutes;
  const securityRaw = (r.security_review_status || "pending").toLowerCase();
  const security =
    securityRaw === "clear" || securityRaw === "pending"
      ? "CLEAR"
      : (r.security_review_status || "—").replaceAll("_", " ").toUpperCase();

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="min-w-0 flex-1">
          <Logo size="md" />
          <p className="mt-3 text-xs font-semibold text-slate-400">
            <Link to="/student" className="hover:text-primary">
              Dashboard
            </Link>{" "}
            ›{" "}
            <Link to="/student/results" className="hover:text-primary">
              My Results
            </Link>{" "}
            › <span className="text-primary">Result</span>
          </p>
          <h1 className="mt-1 text-lg font-extrabold text-primary sm:text-xl">
            {courseCode} · {courseName}
          </h1>
          <p className="text-sm font-semibold text-slate-800">{examTitle}</p>
          <p className="mt-1 text-xs text-slate-500">
            {dateTaken
              ? new Date(dateTaken).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "—"}
            {" · "}
            <span
              className={cn(
                "font-bold",
                isPub ? "text-emerald-600" : "text-amber-700",
              )}
            >
              {isPub ? "Published" : "Pending release"}
            </span>
          </p>
        </div>
        {isPub && (
          <Button
            variant="outline"
            className="w-full font-semibold text-primary sm:w-auto"
            onClick={() => window.print()}
          >
            <Download className="mr-2 h-4 w-4" />
            Download Result
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-4">
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
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-amber-700">
            <Clock className="h-7 w-7" />
          </div>
          <p className="text-lg font-bold text-amber-900">Result not available yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-amber-800">
            Your result is currently being reviewed and will be available soon. When the Examination
            Officer releases results for this subject, your score, grade, and breakdown will appear
            here.
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
          <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="flex flex-col items-center justify-center gap-3 py-2">
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
                label="Date Taken"
                value={
                  dateTaken
                    ? new Date(dateTaken).toLocaleDateString(undefined, { dateStyle: "medium" })
                    : "—"
                }
              />
              <MetaRow
                icon={Clock}
                label="Duration"
                value={durationMin ? `${durationMin} minutes` : "—"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={FileText} label="Total Questions" value={String(totalQ || "—")} tone="blue" />
            <StatCard icon={CheckCircle2} label="Correct Answers" value={String(correct)} tone="green" />
            <StatCard icon={XCircle} label="Wrong Answers" value={String(wrong)} tone="red" />
            <StatCard icon={MinusCircle} label="Unanswered" value={String(unanswered)} tone="amber" />
            <StatCard
              icon={Percent}
              label="Percentage"
              value={`${Math.round(pct)}%`}
              tone="purple"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900">Performance Summary</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                <InfoRow label="Total Questions" value={String(totalQ || "—")} />
                <InfoRow label="Correct" value={String(correct)} />
                <InfoRow label="Wrong" value={String(wrong)} />
                <InfoRow label="Unanswered" value={String(unanswered)} />
                <InfoRow label="Score" value={`${scoreText} / ${maxText}`} />
                <InfoRow label="Percentage" value={`${Math.round(pct)}%`} />
                <InfoRow label="Grade" value={gradeLabel(grade)} />
                <InfoRow
                  label="Result Status"
                  value={pass ? "PASSED" : "FAILED"}
                  badge={pass ? "pass" : "fail"}
                />
                <InfoRow
                  label="Security Review"
                  value={security}
                  badge={security === "CLEAR" ? "clear" : "warn"}
                />
              </ul>
            </div>

            <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900">Result Summary</h2>
              <div className="mt-4 flex flex-1 flex-col items-center justify-center">
                <div className="w-full max-w-[200px]">
                  <ScoreRing pct={pct} score={scoreText} maxMarks={maxText} />
                </div>
                <p className="mt-4 text-center text-sm leading-relaxed text-slate-500">
                  {pass
                    ? "Great job! You have successfully completed the examination. Keep up the good work."
                    : "You did not meet the pass mark this time. Review the course materials and prepare for the next opportunity."}
                </p>
              </div>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Integrity monitored · D4EXAM secure CBT
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Question-by-question answer review is not shown here when the examination is configured
            without review, or while security review is in progress. Contact your Examination Officer
            if you need clarification on a published score.
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
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </p>
      <p className={cn("truncate text-sm text-slate-900", bold && "font-bold")}>{value}</p>
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
    <div className="flex items-start gap-3 py-2.5">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400">{label}</p>
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
        "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm",
        tones[tone],
        className,
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-lg font-extrabold leading-none">{value}</p>
        <p className="mt-0.5 text-[11px] font-semibold opacity-80">{label}</p>
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
