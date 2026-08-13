import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/dashboard/kit";
import { Logo } from "@/components/brand/Logo";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/results")({
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
    courses: { code: string; name: string } | null;
  } | null;
};

function Page() {
  const { data: student, isLoading } = useStudentContext();

  const resultsQ = useQuery({
    queryKey: ["student-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!student) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, total_score, percentage, grade, pass_fail, correct_count, wrong_count, unanswered_count, status, security_review_status, released_at, created_at, examinations(title, duration_minutes, courses(code, name))",
        )
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!student) {
    return <EmptyState title="Student profile not found" description="Contact School Admin." />;
  }

  const rows = resultsQ.data ?? [];
  const published = rows.filter((r) => (r.status || "").toLowerCase() === "published");
  const pending = rows.filter((r) => (r.status || "").toLowerCase() !== "published");

  return (
    <>
      <PageHeader
        title="My Results"
        description={`${student.fullName || student.matric || ""} · Official examination results`}
      />

      {resultsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading results…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No results yet"
          description="After you submit an exam, your result slip appears here when released."
        />
      ) : (
        <div className="space-y-6">
          {published.map((r) => (
            <ResultSlip key={r.id} r={r} student={student} />
          ))}
          {pending.map((r) => (
            <ResultSlip key={r.id} r={r} student={student} pending />
          ))}
        </div>
      )}
    </>
  );
}

function ResultSlip({
  r,
  student,
  pending,
}: {
  r: ResultRow;
  student: {
    fullName: string;
    matric: string | null;
    departmentName: string | null;
    levelName: string | null;
    facultyName: string | null;
    schoolName: string | null;
  };
  pending?: boolean;
}) {
  const isPub = !pending && (r.status || "").toLowerCase() === "published";
  const pass = (r.pass_fail || "").toLowerCase() === "pass";
  const attempted =
    (r.correct_count ?? 0) + (r.wrong_count ?? 0) + (r.unanswered_count ?? 0);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-[#0b1b3a] px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              D4EXAM · Result slip
            </p>
            <p className="text-sm font-bold">
              {r.examinations?.courses?.code ?? "—"} · {r.examinations?.title ?? "Examination"}
            </p>
          </div>
        </div>
        <span
          className={
            isPub
              ? "rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase text-white"
              : "rounded-full bg-amber-400 px-3 py-1 text-[10px] font-bold uppercase text-slate-900"
          }
        >
          {isPub ? "Published" : "Under review"}
        </span>
      </div>

      <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2 text-sm">
          <Row label="Candidate name" value={student.fullName || "—"} bold />
          <Row label="Matric number" value={student.matric || "—"} />
          <Row label="Faculty" value={student.facultyName || "—"} />
          <Row label="Department" value={student.departmentName || "—"} />
          <Row label="Level / class" value={student.levelName || "—"} />
          <Row
            label="Course"
            value={r.examinations?.courses?.name || r.examinations?.courses?.code || "—"}
          />
          <Row label="Exam title" value={r.examinations?.title || "—"} />
        </div>

        <div
          className={
            isPub
              ? pass
                ? "flex min-w-[160px] flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-center"
                : "flex min-w-[160px] flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-5 text-center"
              : "flex min-w-[160px] flex-col items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-center"
          }
        >
          {isPub ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Score</p>
              <p className="mt-1 text-4xl font-black text-slate-900">
                {r.percentage != null ? `${r.percentage}%` : "—"}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-700">
                {r.total_score != null ? `${r.total_score} marks` : ""}
                {r.grade ? ` · Grade ${r.grade}` : ""}
              </p>
              <p
                className={
                  pass
                    ? "mt-3 rounded-full bg-emerald-600 px-4 py-1 text-sm font-extrabold uppercase text-white"
                    : "mt-3 rounded-full bg-red-600 px-4 py-1 text-sm font-extrabold uppercase text-white"
                }
              >
                {r.pass_fail || "—"}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase text-amber-800">Pending</p>
              <p className="mt-2 max-w-[140px] text-xs text-amber-900">
                Score will show here after the Examination Officer releases results.
              </p>
            </>
          )}
        </div>
      </div>

      {isPub && (
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:grid-cols-4">
          <Stat label="Questions" value={String(attempted || "—")} />
          <Stat label="Correct" value={String(r.correct_count ?? 0)} />
          <Stat label="Wrong" value={String(r.wrong_count ?? 0)} />
          <Stat label="Unanswered" value={String(r.unanswered_count ?? 0)} />
        </div>
      )}

      <div className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
        {r.released_at
          ? `Released ${new Date(r.released_at).toLocaleString()}`
          : r.created_at
            ? `Submitted ${new Date(r.created_at).toLocaleString()}`
            : ""}
        {r.security_review_status
          ? ` · Security: ${r.security_review_status.replaceAll("_", " ")}`
          : ""}
      </div>
    </article>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="w-28 shrink-0 text-xs font-semibold text-slate-500">{label}</span>
      <span className={bold ? "text-sm font-bold text-slate-900" : "text-sm text-slate-900"}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
