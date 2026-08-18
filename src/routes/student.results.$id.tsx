import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Printer,
  ShieldAlert,
  User,
  Hash,
  BookOpen,
  Trophy,
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
    duration_minutes?: number | null;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    courses: { code: string; name: string } | null;
  } | null;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function performanceLabel(pct: number | null, passFail: string | null): string {
  const pf = (passFail || "").toLowerCase();
  if (pf === "fail" || pf === "failed") return "Unsuccessful";
  if (pct == null) return "—";
  if (pct >= 80) return "Excellent";
  if (pct >= 70) return "Very good";
  if (pct >= 60) return "Good";
  if (pct >= 50) return "Average";
  if (pf === "pass") return "Pass";
  return "Needs improvement";
}

function scoreTone(pct: number | null, passFail: string | null, released: boolean) {
  if (!released) return "neutral" as const;
  const pf = (passFail || "").toLowerCase();
  if (pf === "fail" || pf === "failed") return "fail" as const;
  if (pct == null) return "neutral" as const;
  if (pct >= 70) return "success" as const;
  if (pct >= 50) return "amber" as const;
  if (pf === "pass") return "success" as const;
  return "fail" as const;
}

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
      const select = `id, exam_id, student_id, attempt_id, total_score, max_score, percentage, grade, pass_fail,
           correct_count, wrong_count, unanswered_count, status, security_review_status,
           released_at, created_at,
           examinations(title, duration_minutes, scheduled_start, scheduled_end, courses(code, name))`;
      const byId = await supabase
        .from("results")
        .select(select)
        .eq("student_id", student.studentId)
        .eq("id", id)
        .maybeSingle();
      if (byId.data) return byId.data as unknown as ResultRow;
      const byExam = await supabase
        .from("results")
        .select(select)
        .eq("student_id", student.studentId)
        .eq("exam_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (byExam.data as unknown as ResultRow) ?? null;
    },
  });

  const attemptQ = useQuery({
    queryKey: ["student-result-attempt", resultQ.data?.attempt_id, resultQ.data?.exam_id],
    enabled: Boolean(resultQ.data),
    queryFn: async () => {
      const r = resultQ.data!;
      if (r.attempt_id) {
        const { data } = await supabase
          .from("exam_attempts")
          .select("id, status, started_at, submitted_at, tab_switch_count")
          .eq("id", r.attempt_id)
          .maybeSingle();
        if (data) return data;
      }
      const { data } = await supabase
        .from("exam_attempts")
        .select("id, status, started_at, submitted_at, tab_switch_count")
        .eq("exam_id", r.exam_id)
        .eq("student_id", r.student_id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const avgQ = useQuery({
    queryKey: ["student-result-exam-avg", resultQ.data?.exam_id],
    enabled: Boolean(resultQ.data?.exam_id),
    queryFn: async () => {
      const examId = resultQ.data!.exam_id;
      const { data } = await supabase
        .from("results")
        .select("percentage, status, released_at")
        .eq("exam_id", examId)
        .not("percentage", "is", null)
        .limit(500);
      const released = (data ?? []).filter((row) => {
        const st = String((row as { status: string }).status || "").toLowerCase();
        return st === "published" || Boolean((row as { released_at: string | null }).released_at);
      });
      if (!released.length) return null;
      const sum = released.reduce(
        (acc, row) => acc + Number((row as { percentage: number }).percentage || 0),
        0,
      );
      return Math.round(sum / released.length);
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
        <p className="text-xs text-slate-500">
          This result does not exist or does not belong to your account.
        </p>
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
    (statusLower === "pending" || statusLower === "held" || statusLower === "processing" || !r.released_at);

  const pct = r.percentage != null ? Math.round(Number(r.percentage)) : null;
  const pass = String(r.pass_fail || "").toLowerCase() === "pass";
  const fail =
    String(r.pass_fail || "").toLowerCase() === "fail" ||
    String(r.pass_fail || "").toLowerCase() === "failed";
  const course = r.examinations?.courses;
  const tone = scoreTone(pct, r.pass_fail, isPub);
  const level = isPub ? performanceLabel(pct, r.pass_fail) : "—";
  const attempt = attemptQ.data as {
    started_at?: string | null;
    submitted_at?: string | null;
    status?: string | null;
  } | null;

  const totalQ =
    (r.correct_count ?? 0) + (r.wrong_count ?? 0) + (r.unanswered_count ?? 0) ||
    (r.max_score != null ? Number(r.max_score) : null);

  const dateTaken = attempt?.submitted_at || r.created_at;
  const startT = fmtTime(attempt?.started_at);
  const endT = fmtTime(attempt?.submitted_at);
  const timeRange =
    startT && endT ? `${startT} – ${endT}` : startT || endT || "—";
  const durationLabel = r.examinations?.duration_minutes
    ? `${r.examinations.duration_minutes} min`
    : "—";
  const sessionLabel =
    [student?.sessionName, student?.semesterName].filter(Boolean).join(" · ") || "—";

  const ringColor =
    tone === "success"
      ? "stroke-emerald-500"
      : tone === "fail"
        ? "stroke-red-500"
        : tone === "amber"
          ? "stroke-amber-500"
          : "stroke-slate-300";
  const ringText =
    tone === "success"
      ? "text-emerald-700"
      : tone === "fail"
        ? "text-red-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-slate-500";

  const circumference = 2 * Math.PI * 54;
  const dash =
    isPub && pct != null
      ? circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference
      : circumference;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-10 print:max-w-none print:space-y-3 print:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs font-semibold">
          <Link to="/student/results">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Results
          </Link>
        </Button>
        {isPub ? (
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs font-semibold"
            onClick={handlePrint}
          >
            <Printer className="h-3.5 w-3.5" /> Print Result
          </Button>
        ) : null}
      </div>

      <div className="print:block">
        <SchoolResultHeader schoolId={student?.schoolId} className="mb-3 print:mb-2" />
      </div>

      {isTerminated ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 print:border-red-300">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-900">Exam terminated</p>
              <p className="mt-0.5 text-xs text-red-800">
                This examination attempt was terminated by the Examination Officer. Scores are not
                released for this paper.
              </p>
            </div>
          </div>
        </div>
      ) : isHeld ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print:border-amber-300">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-900">
                {statusLower === "processing" ? "Result pending" : "Result held"}
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Your result is held pending Examination Officer release. Scores stay hidden until
                the officer publishes them.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:shadow-none">
        <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <div className="mx-auto flex flex-col items-center lg:mx-0">
            <div className="relative h-36 w-36 sm:h-40 sm:w-40">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  strokeWidth="10"
                  className="stroke-slate-100"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  strokeWidth="10"
                  strokeLinecap="round"
                  className={ringColor}
                  strokeDasharray={circumference}
                  strokeDashoffset={dash}
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isPub && pct != null ? (
                  <>
                    <span className={cn("text-3xl font-black tabular-nums sm:text-4xl", ringText)}>
                      {pct}%
                    </span>
                    <span className={cn("text-[11px] font-semibold", ringText)}>{level}</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-black text-slate-400">—</span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {isTerminated ? "Terminated" : "Held"}
                    </span>
                  </>
                )}
              </div>
            </div>
            {isPub && pass ? (
              <div className="mt-2 flex gap-0.5" aria-label="Performance stars">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "text-sm",
                      pct != null && pct >= i * 16 ? "text-amber-400" : "text-slate-200",
                    )}
                  >
                    ★
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-3 text-center lg:text-left">
            <div>
              <h1 className="text-lg font-extrabold leading-tight text-slate-900 sm:text-xl">
                Exam Result
              </h1>
              <p className="mt-0.5 text-sm font-semibold text-slate-700">
                {course?.code ? `${course.code} — ` : ""}
                {r.examinations?.title ?? "Examination"}
              </p>
              {sessionLabel !== "—" ? (
                <span className="mt-1.5 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {sessionLabel}
                </span>
              ) : null}
            </div>

            <dl className="grid gap-2 text-left text-xs sm:grid-cols-2">
              <InfoLine icon={User} label="Student" value={student?.fullName ?? "—"} />
              <InfoLine icon={Hash} label="Matric" value={student?.matric ?? "—"} />
              <InfoLine
                icon={BookOpen}
                label="Course"
                value={
                  course
                    ? `${course.code}${course.name ? ` — ${course.name}` : ""}`
                    : "—"
                }
              />
              <InfoLine icon={CalendarDays} label="Date taken" value={fmtDate(dateTaken)} />
              <InfoLine icon={Clock} label="Time" value={timeRange} />
              <InfoLine icon={Clock} label="Duration" value={durationLabel} />
            </dl>
          </div>

          <div className="mx-auto flex flex-col items-center gap-2 lg:mx-0 lg:items-end">
            <StatusChip
              released={isPub}
              terminated={isTerminated}
              held={isHeld}
            />
            {isPub && r.grade ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Grade
                </p>
                <p className="text-2xl font-black text-slate-900">{r.grade}</p>
              </div>
            ) : null}
            {isPub && r.pass_fail ? (
              <div
                className={cn(
                  "rounded-xl px-4 py-2 text-center",
                  pass ? "bg-emerald-50 text-emerald-800" : fail ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-700",
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  Remark
                </p>
                <p className="text-lg font-black uppercase">{r.pass_fail}</p>
              </div>
            ) : null}
          </div>
        </div>

        {isPub ? (
          <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-4">
            <SummaryCell
              label="Score"
              value={`${r.total_score ?? "—"} / ${r.max_score ?? "—"}`}
              tone="slate"
            />
            <SummaryCell
              label="Correct"
              value={String(r.correct_count ?? "—")}
              tone="success"
            />
            <SummaryCell
              label="Incorrect"
              value={String(r.wrong_count ?? "—")}
              tone="fail"
            />
            <SummaryCell
              label="Unanswered"
              value={String(r.unanswered_count ?? "—")}
              tone="amber"
            />
          </div>
        ) : null}
      </section>

      {isPub ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:shadow-none">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-slate-900">Performance overview</h2>
            </div>
            <p className="text-xs text-slate-600">
              {pct != null ? (
                <>
                  You scored{" "}
                  <span className="font-bold text-slate-900">{pct}%</span>
                  {avgQ.data != null ? (
                    <>
                      {" "}
                      · Class average on released scripts:{" "}
                      <span className="font-bold text-slate-900">{avgQ.data}%</span>
                    </>
                  ) : null}
                  . Performance level:{" "}
                  <span className="font-bold text-slate-900">{level}</span>
                  {r.grade ? (
                    <>
                      {" "}
                      · Grade <span className="font-bold text-slate-900">{r.grade}</span>
                    </>
                  ) : null}
                  .
                </>
              ) : (
                "Score details are available above."
              )}
            </p>
            {pct != null ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                  <span>Your score</span>
                  <span className="tabular-nums text-slate-800">{pct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      tone === "success"
                        ? "bg-emerald-500"
                        : tone === "fail"
                          ? "bg-red-500"
                          : tone === "amber"
                            ? "bg-amber-500"
                            : "bg-slate-400",
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
                {avgQ.data != null ? (
                  <>
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>Class average (released)</span>
                      <span className="tabular-nums text-slate-800">{avgQ.data}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-400/80"
                        style={{ width: `${Math.min(100, Math.max(0, avgQ.data))}%` }}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
            {pass || fail ? (
              <p
                className={cn(
                  "mt-4 rounded-lg px-3 py-2 text-xs font-semibold",
                  pass ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
                )}
              >
                {pass
                  ? "Great job — you passed this examination. Keep building on this performance."
                  : "This attempt did not meet the pass mark. Speak with your lecturer or officer if you need guidance."}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 print:shadow-none">
            <h2 className="mb-3 text-sm font-bold text-slate-900">Performance summary</h2>
            <ul className="space-y-2.5 text-sm">
              <SummaryRow
                label="Total questions"
                value={totalQ != null ? String(totalQ) : "—"}
                dot="bg-slate-400"
              />
              <SummaryRow
                label="Correct answers"
                value={String(r.correct_count ?? "—")}
                dot="bg-emerald-500"
              />
              <SummaryRow
                label="Incorrect answers"
                value={String(r.wrong_count ?? "—")}
                dot="bg-red-500"
              />
              <SummaryRow
                label="Unanswered"
                value={String(r.unanswered_count ?? "—")}
                dot="bg-amber-400"
              />
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-50 py-2">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Status</p>
                <p className="font-bold text-emerald-700">Released</p>
              </div>
              <div className="rounded-lg bg-slate-50 py-2">
                <p className="text-[10px] font-semibold uppercase text-slate-400">Released on</p>
                <p className="font-bold text-slate-800">{fmtDate(r.released_at)}</p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <p className="text-center text-[10px] text-slate-400 print:mt-6">
        Official examination result · D4EXAM · {student?.schoolName ?? "School"}
      </p>
    </div>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-xs font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function StatusChip({
  released,
  terminated,
  held,
}: {
  released: boolean;
  terminated: boolean;
  held: boolean;
}) {
  if (terminated) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-800">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Terminated
      </span>
    );
  }
  if (released) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" /> Released
      </span>
    );
  }
  if (held) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Held
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
      Pending
    </span>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "success" | "fail" | "amber";
}) {
  const tones = {
    slate: "bg-white text-slate-900",
    success: "bg-white text-emerald-800",
    fail: "bg-white text-red-800",
    amber: "bg-white text-amber-900",
  };
  return (
    <div className={cn("bg-white px-3 py-3 text-center", tones[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-base font-extrabold tabular-nums sm:text-lg">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  dot,
}: {
  label: string;
  value: string;
  dot: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
      <span className="flex-1 text-xs text-slate-600">{label}</span>
      <span className="text-sm font-bold tabular-nums text-slate-900">{value}</span>
    </li>
  );
}
