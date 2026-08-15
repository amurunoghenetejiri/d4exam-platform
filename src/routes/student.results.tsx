import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ArrowLeft,
  Loader2,
  Download,
} from "lucide-react";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { SchoolResultHeader } from "@/components/brand/SchoolResultHeader";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/results")({
  validateSearch: (s: Record<string, unknown>): { id?: string } => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "My Results — D4EXAM" },
      { name: "description", content: "Your examination results." },
    ],
  }),
  component: Page,
});

type ResultRow = {
  id: string;
  exam_id: string;
  student_id?: string;
  total_score: number | null;
  percentage: number | null;
  grade: string | null;
  pass_fail: string | null;
  correct_count?: number | null;
  wrong_count?: number | null;
  unanswered_count?: number | null;
  status: string;
  security_review_status?: string | null;
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

function ScoreRing({ pct, score, maxMarks }: { pct: number; score: string; maxMarks: string }) {
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
        <p className="text-5xl font-black leading-none text-primary">{Math.round(clamped)}%</p>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {score} / {maxMarks}
        </p>
      </div>
    </div>
  );
}

function Page() {
  const navigate = useNavigate();
  const { id: detailId } = Route.useSearch();
  const { data: student, isLoading } = useStudentContext();

  const resultsQ = useQuery({
    queryKey: ["student-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!student) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, student_id, total_score, percentage, grade, pass_fail, correct_count, wrong_count, unanswered_count, status, security_review_status, released_at, created_at, examinations(title, duration_minutes, scheduled_start, courses(code, name))",
        )
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const detailQ = useQuery({
    queryKey: ["student-result-detail", detailId, student?.studentId],
    enabled: Boolean(detailId && student?.studentId && student?.schoolId),
    queryFn: async () => {
      if (!student || !detailId) return null;
      const byId = await supabase
        .from("results")
        .select(
          "id, exam_id, student_id, total_score, percentage, grade, pass_fail, correct_count, wrong_count, unanswered_count, status, security_review_status, released_at, created_at, examinations(title, duration_minutes, scheduled_start, courses(code, name))",
        )
        .eq("id", detailId)
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId)
        .maybeSingle();
      if (byId.data) return byId.data as ResultRow;
      const byExam = await supabase
        .from("results")
        .select(
          "id, exam_id, student_id, total_score, percentage, grade, pass_fail, correct_count, wrong_count, unanswered_count, status, security_review_status, released_at, created_at, examinations(title, duration_minutes, scheduled_start, courses(code, name))",
        )
        .eq("exam_id", detailId)
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId)
        .maybeSingle();
      if (byExam.error) throw byExam.error;
      return (byExam.data as ResultRow | null) ?? null;
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!student) {
    return <EmptyState title="Student profile not found" description="Contact School Admin." />;
  }

  if (detailId) {
    if (detailQ.isLoading) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading result…
        </div>
      );
    }
    const r = detailQ.data;
    if (!r) {
      return (
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <SchoolResultHeader schoolId={student.schoolId} centered className="justify-center" />
          <p className="mt-4 font-bold text-slate-900">Result not found</p>
          <p className="mt-2 text-sm text-slate-500">This result is not available for your account.</p>
          <Button className="mt-6" variant="outline" onClick={() => void navigate({ to: "/student/results", search: {} })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Results
          </Button>
        </div>
      );
    }

    if (r.id && detailId !== r.id) {
      void navigate({ to: "/student/results/$id", params: { id: r.id }, replace: true });
    }

    const isPub = (r.status || "").toLowerCase() === "published";
    const pass = (r.pass_fail || "").toLowerCase() === "pass";
    const pct = Number(r.percentage ?? 0);
    const correct = r.correct_count ?? 0;
    const wrong = r.wrong_count ?? 0;
    const unanswered = r.unanswered_count ?? 0;
    const totalQ = correct + wrong + unanswered;
    const scoreText = String(r.total_score ?? correct);
    const maxText = String(totalQ || r.total_score || "—");
    const courseCode = r.examinations?.courses?.code ?? "—";
    const courseName = r.examinations?.courses?.name ?? r.examinations?.title ?? "Examination";
    const examTitle = r.examinations?.title || `${courseCode} – ${courseName}`;
    const dateTaken = r.released_at || r.created_at;

    return (
      <div className="mx-auto max-w-5xl space-y-5 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="min-w-0 flex-1">
            <SchoolResultHeader schoolId={student.schoolId} size="lg" />
            <p className="mt-3 text-xs font-semibold text-slate-400">
              <button type="button" className="hover:text-primary" onClick={() => void navigate({ to: "/student/results", search: {} })}>
                My Results
              </button>{" "}
              › <span className="text-primary">Result</span>
            </p>
            <h1 className="mt-1 text-lg font-extrabold text-primary sm:text-xl">
              {courseCode} · {courseName}
            </h1>
            <p className="text-sm font-semibold text-slate-800">{examTitle}</p>
            <p className="mt-1 text-xs text-slate-500">
              {dateTaken ? new Date(dateTaken).toLocaleString() : "—"}
              {" · "}
              <span className={cn("font-bold", isPub ? "text-emerald-600" : "text-amber-700")}>
                {isPub ? "Published" : "Pending release"}
              </span>
            </p>
          </div>
          {isPub && (
            <Button variant="outline" className="font-semibold text-primary" onClick={() => window.print()}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-4">
          <Info label="Student name" value={student.fullName || "—"} bold />
          <Info label="Matric" value={student.matric || "—"} />
          <Info label="Department" value={student.departmentName || "—"} />
          <Info label="Level" value={student.levelName || "—"} />
          <Info label="Session" value={student.sessionName || "—"} />
          <Info label="Semester" value={student.semesterName || "—"} />
        </div>

        {!isPub ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
            <p className="text-lg font-bold text-amber-900">Result not available yet</p>
            <p className="mt-2 text-sm text-amber-800">
              Your result is currently being reviewed and will be available soon.
            </p>
            <Button className="mt-6" variant="outline" onClick={() => void navigate({ to: "/student/results", search: {} })}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Results
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-2">
              <div className="flex flex-col items-center justify-center gap-3 py-2">
                <ScoreRing pct={pct} score={scoreText} maxMarks={maxText} />
                <p className="text-sm font-bold text-slate-700">Grade: {gradeLabel(r.grade)}</p>
                <span
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-extrabold uppercase text-white",
                    pass ? "bg-emerald-500" : "bg-red-500",
                  )}
                >
                  {pass ? "PASSED" : "FAILED"}
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-slate-500">Exam:</span>{" "}
                  <span className="font-semibold">{examTitle}</span>
                </p>
                <p>
                  <span className="text-slate-500">Course:</span>{" "}
                  <span className="font-semibold">
                    {courseCode} – {courseName}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Duration:</span>{" "}
                  <span className="font-semibold">
                    {r.examinations?.duration_minutes
                      ? `${r.examinations.duration_minutes} minutes`
                      : "—"}
                  </span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Total Questions" value={String(totalQ || "—")} />
              <Stat label="Correct" value={String(correct)} tone="green" />
              <Stat label="Wrong" value={String(wrong)} tone="red" />
              <Stat label="Unanswered" value={String(unanswered)} tone="amber" />
              <Stat label="Percentage" value={`${Math.round(pct)}%`} tone="blue" />
            </div>
          </>
        )}

        <Button variant="outline" className="font-semibold" onClick={() => void navigate({ to: "/student/results", search: {} })}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Results
        </Button>
      </div>
    );
  }

  const rows = resultsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="My Results"
        description={`${student.fullName || student.matric || ""} · ${student.sessionName || "Session"} · ${student.semesterName || "Semester"}`}
      />

      {resultsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading results…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No results yet"
          description="After you submit an exam, each subject appears here. Open View to see your score breakdown."
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const isPub = (r.status || "").toLowerCase() === "published";
            const code = r.examinations?.courses?.code ?? "—";
            const name = r.examinations?.courses?.name ?? "Course";
            const examTitle = r.examinations?.title ?? "Examination";
            const meta = [examTitle, student.sessionName, student.semesterName]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-extrabold text-slate-900">{code}</p>
                      <StatusBadge status={isPub ? "published" : "pending"} />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-slate-800">
                      {name}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{meta}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                  <div className="min-w-0">
                    {isPub ? (
                      <p className="text-sm font-bold text-slate-900">
                        <span className="text-primary">
                          {r.percentage != null ? `${r.percentage}%` : "—"}
                        </span>
                        {r.grade ? <span className="text-slate-400"> · </span> : null}
                        {r.grade ? <span>Grade {r.grade}</span> : null}
                        {r.pass_fail ? (
                          <span
                            className={
                              (r.pass_fail || "").toLowerCase() === "pass"
                                ? " text-emerald-600"
                                : " text-red-600"
                            }
                          >
                            {" "}· {r.pass_fail}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-amber-700">Held for review</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    className="h-8 shrink-0 px-3 text-sm font-semibold"
                    onClick={() =>
                      void navigate({
                        to: "/student/results/$id",
                        params: { id: r.id },
                      })
                    }
                  >
                    View
                    <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Info({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("truncate text-sm text-slate-900", bold && "font-bold")}>{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber" | "blue";
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
    blue: "bg-blue-50 text-primary border-blue-100",
  };
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm",
        tone && tones[tone],
      )}
    >
      <p className="text-lg font-extrabold leading-none">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold opacity-80">{label}</p>
    </div>
  );
}
