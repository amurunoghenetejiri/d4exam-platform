import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Percent,
  Star,
  FileText,
  Building2,
  GraduationCap,
  CalendarDays,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

function ScoreRing({ pct, score, total }: { pct: number; score: string; total: string }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative mx-auto grid h-44 w-44 place-items-center sm:h-48 sm:w-48">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#2563eb"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="relative z-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your Score</p>
        <p className="text-4xl font-black text-primary sm:text-5xl">{clamped}%</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-600">
          {score} / {total}
        </p>
      </div>
    </div>
  );
}

function ResultDetailPage() {
  const { id } = Route.useParams();
  const { data: student, isLoading: sLoading } = useStudentContext();

  const resultQ = useQuery({
    queryKey: ["student-result-detail", id, student?.studentId],
    enabled: Boolean(id && student?.studentId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!student) return null;
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, total_score, percentage, grade, pass_fail, correct_count, wrong_count, unanswered_count, status, security_review_status, released_at, created_at, examinations(title, duration_minutes, scheduled_start, courses(code, name))",
        )
        .eq("id", id)
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId)
        .maybeSingle();
      if (error) throw error;
      return data as ResultRow | null;
    },
  });

  if (sLoading || resultQ.isLoading) {
    return <p className="text-sm text-slate-500">Loading result…</p>;
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
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-bold text-slate-900">Result not found</p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to="/student/results">Back to My Results</Link>
        </Button>
      </div>
    );
  }

  const isPub = (r.status || "").toLowerCase() === "published";
  const pass = (r.pass_fail || "").toLowerCase() === "pass";
  const pct = r.percentage ?? 0;
  const correct = r.correct_count ?? 0;
  const wrong = r.wrong_count ?? 0;
  const unanswered = r.unanswered_count ?? 0;
  const totalQ = correct + wrong + unanswered || 0;
  const scoreText =
    r.total_score != null ? String(r.total_score) : String(correct);
  const totalText = totalQ > 0 ? String(totalQ) : "—";
  const security =
    (r.security_review_status || "pending").toLowerCase() === "clear" ||
    (r.security_review_status || "").toLowerCase() === "pending"
      ? "CLEAR"
      : (r.security_review_status || "—").replaceAll("_", " ").toUpperCase();

  const courseCode = r.examinations?.courses?.code ?? "—";
  const courseName = r.examinations?.courses?.name ?? r.examinations?.title ?? "Examination";
  const dateTaken = r.released_at || r.created_at;
  const durationMin = r.examinations?.duration_minutes;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-400">
            <Link to="/student" className="hover:text-primary">
              Dashboard
            </Link>{" "}
            ›{" "}
            <Link to="/student/examinations" className="hover:text-primary">
              My Examinations
            </Link>{" "}
            › <span className="text-primary">Result</span>
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900">
            <FileText className="h-6 w-6 text-primary" />
            Exam Result
          </h1>
          <p className="text-sm text-slate-500">Your performance in this examination</p>
        </div>
        {isPub && (
          <Button
            variant="outline"
            className="font-semibold text-primary"
            onClick={() => window.print()}
          >
            <Download className="mr-2 h-4 w-4" />
            Download Result
          </Button>
        )}
      </div>

      {/* Student identity strip */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Student name" value={student.fullName || "—"} bold />
        <Info label="Matric number" value={student.matric || "—"} />
        <Info label="Department" value={student.departmentName || "—"} />
        <Info label="Faculty / College" value={student.facultyName || "—"} />
        <Info label="Level" value={student.levelName || "—"} />
        <Info label="Session" value={student.sessionName || "—"} />
        <Info label="Semester" value={student.semesterName || "—"} />
        <Info label="School" value={student.schoolName || "—"} />
      </div>

      {!isPub ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-lg font-bold text-amber-900">Result under review</p>
          <p className="mt-2 text-sm text-amber-800">
            Your score will appear here after the Examination Officer releases results.
          </p>
          <Button className="mt-6" variant="outline" asChild>
            <Link to="/student/results">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Results
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_1.1fr]">
            <div className="flex flex-col items-center justify-center gap-3 py-2">
              <ScoreRing pct={pct} score={scoreText} total={totalText} />
              <p
                className={cn(
                  "text-sm font-bold",
                  pass ? "text-emerald-600" : "text-red-600",
                )}
              >
                {pass ? "Excellent Performance!" : "Keep practising — you can improve."}
              </p>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white",
                  pass ? "bg-emerald-500" : "bg-red-500",
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {pass ? "PASSED" : "FAILED"}
              </span>
            </div>

            <div className="space-y-0 divide-y divide-slate-100 text-sm">
              <MetaRow
                icon={FileText}
                label="Exam Title"
                value={`${courseCode} – ${courseName}`}
              />
              <MetaRow
                icon={Building2}
                label="Department"
                value={student.departmentName || "—"}
              />
              <MetaRow icon={GraduationCap} label="Level" value={student.levelName || "—"} />
              <MetaRow
                icon={CalendarDays}
                label="Semester"
                value={student.semesterName || "—"}
              />
              <MetaRow
                icon={CalendarDays}
                label="Session"
                value={student.sessionName || "—"}
              />
              <MetaRow
                icon={CalendarDays}
                label="Date Taken"
                value={dateTaken ? new Date(dateTaken).toLocaleDateString() : "—"}
              />
              <MetaRow
                icon={Clock}
                label="Duration"
                value={durationMin ? `${durationMin} minutes` : "—"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              icon={CheckCircle2}
              label="Correct Answers"
              value={String(correct)}
              tone="green"
            />
            <StatCard icon={XCircle} label="Wrong Answers" value={String(wrong)} tone="red" />
            <StatCard
              icon={MinusCircle}
              label="Unanswered"
              value={String(unanswered)}
              tone="amber"
            />
            <StatCard icon={Percent} label="Percentage" value={`${pct}%`} tone="blue" />
            <StatCard
              icon={Star}
              label="Grade"
              value={gradeLabel(r.grade)}
              tone="purple"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900">Exam Information</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                <InfoRow label="Total Questions" value={String(totalQ || "—")} />
                <InfoRow label="Question Type" value="Multiple Choice" />
                <InfoRow
                  label="Passing Score"
                  value="40%"
                />
                <InfoRow label="Your Score" value={`${scoreText}/${totalText}`} />
                <InfoRow label="Grade" value={gradeLabel(r.grade)} />
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

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-extrabold text-slate-900">Result Summary</h2>
              <p className="mt-6 text-center text-sm leading-relaxed text-slate-500">
                {pass
                  ? "Great job! You have successfully completed the examination. Keep up the good work and continue striving for excellence."
                  : "You did not meet the pass mark this time. Review the course materials and prepare for the next opportunity."}
              </p>
              <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Integrity monitored · D4EXAM secure CBT
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3">
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
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("text-sm text-slate-900", bold && "font-bold")} >{value}</p>
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
