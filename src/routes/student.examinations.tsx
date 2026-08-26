import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, CalendarDays } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import {
  useStudentContext,
  STUDENT_VISIBLE_EXAM_STATUSES,
  examAvailability,
  formatExamWindow,
} from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { processDueExamReminders } from "@/lib/notify";
import { assertOnline } from "@/lib/require-online";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/examinations")({
  head: () => ({
    meta: [
      { title: "My Examinations — D4EXAM" },
      {
        name: "description",
        content: "Only examinations approved by the Examination Officer appear here.",
      },
    ],
  }),
  component: Page,
});

type ExamRow = {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_minutes: number;
  course_id: string | null;
  courses: { code: string; name: string } | null;
};

type AttemptRow = {
  exam_id: string;
  status: string;
  submitted_at: string | null;
};

const DONE_ATTEMPT_STATUSES = ["submitted", "terminated", "flagged"];

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

function useCountdown(targetIso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [targetIso]);
  if (!targetIso) return { remainingMs: null as number | null, ready: false };
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return { remainingMs: null, ready: false };
  const remainingMs = Math.max(0, target - now);
  return { remainingMs, ready: remainingMs <= 0 };
}

function StartExamButton({ examId }: { examId: string }) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      size="sm"
      className="h-9 w-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90 sm:h-8 sm:w-auto"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          window.alert("Connect to the internet to write this exam.");
          return;
        }
        void navigate({ to: "/student/exam/$id", params: { id: examId } });
      }}
    >
      Start exam
    </Button>
  );
}

function StartOrCountdownButton({
  examId,
  scheduledStart,
  canStartNow,
}: {
  examId: string;
  scheduledStart: string | null;
  canStartNow: boolean;
}) {
  const { remainingMs, ready } = useCountdown(scheduledStart);

  if (canStartNow || ready) {
    return <StartExamButton examId={examId} />;
  }

  if (remainingMs == null) {
    return (
      <Button size="sm" variant="outline" className="h-9 w-full font-semibold sm:h-8 sm:w-auto" disabled>
        Schedule TBC
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled
      className={cn(
        "h-9 w-full font-mono text-[11px] font-bold tabular-nums sm:h-8 sm:w-auto sm:min-w-[9.5rem] sm:text-xs",
        remainingMs < 5 * 60_000 && "border-amber-300 text-amber-800",
        remainingMs < 60_000 && "border-red-300 text-red-700",
      )}
    >
      <Clock className="mr-1.5 h-3.5 w-3.5 shrink-0" />
      Starts in {formatCountdown(remainingMs)}
    </Button>
  );
}

function Page() {
  const { data: student, isLoading: sLoading } = useStudentContext();
  const schoolId = student?.schoolId ?? null;

  useEffect(() => {
    if (!schoolId) return;
    const t = window.setTimeout(() => { void processDueExamReminders(schoolId); }, 2500);
    return () => window.clearTimeout(t);
  }, [schoolId]);

  useRealtimeInvalidate(
    `student-exams-sync-${student?.studentId ?? "x"}`,
    student?.studentId
      ? [
          { table: "exam_attempts", filter: `student_id=eq.${student.studentId}` },
          { table: "results", filter: `student_id=eq.${student.studentId}` },
          { table: "examinations" },
        ]
      : [],
    [
      ["student-exams"],
      ["student-attempts", student?.studentId],
      ["student-result-ids", student?.studentId],
      ["student-dashboard-exams"],
      ["student-dashboard-attempts"],
    ],
    Boolean(student?.studentId),
    1500,
  );

  const examsQ = useQuery({
    queryKey: ["student-exams", schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(schoolId),
    staleTime: 10_000,
    refetchOnMount: "always",
    queryFn: async () => {
      if (!schoolId) return [] as ExamRow[];
      let q = supabase
        .from("examinations")
        .select(
          "id, title, status, scheduled_start, scheduled_end, duration_minutes, course_id, courses(code, name)",
        )
        .eq("school_id", schoolId)
        .in("status", [...STUDENT_VISIBLE_EXAM_STATUSES])
        .order("scheduled_start", { ascending: true, nullsFirst: false })
        .limit(100);

      if (student?.courseIds?.length) {
        q = q.in("course_id", student.courseIds);
      }

      const { data, error } = await q;
      if (error) { console.warn("[offline]", error); return []; }
      return (data ?? []) as ExamRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["student-attempts", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 5_000,
    refetchOnMount: "always",
    queryFn: async () => {
      if (!student?.studentId) return [] as AttemptRow[];
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("exam_id, status, submitted_at")
        .eq("student_id", student.studentId);
      if (error) { console.warn("[offline]", error); return []; }
      return (data ?? []) as AttemptRow[];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["student-result-ids", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 5_000,
    refetchOnMount: "always",
    queryFn: async () => {
      if (!student?.studentId) return {} as Record<string, string>;
      let q = supabase
        .from("results")
        .select("id, exam_id")
        .eq("student_id", student.studentId);
      if (student.schoolId) q = q.eq("school_id", student.schoolId);
      const { data, error } = await q;
      if (error) { console.warn("[offline]", error); return []; }
      const map: Record<string, string> = {};
      for (const r of data ?? []) {
        map[(r as { exam_id: string }).exam_id] = (r as { id: string }).id;
      }
      return map;
    },
  });
  const resultIdByExam = resultsQ.data ?? {};

  const attemptByExam = useMemo(() => {
    const map = new Map<string, AttemptRow>();
    for (const a of attemptsQ.data ?? []) map.set(a.exam_id, a);
    return map;
  }, [attemptsQ.data]);

  const exams = examsQ.data ?? [];

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  const { live, upcoming, done } = useMemo(() => {
    void tick;
    const liveList: ExamRow[] = [];
    const upList: ExamRow[] = [];
    const doneList: ExamRow[] = [];

    for (const e of exams) {
      const attempt = attemptByExam.get(e.id);
      const hasResult = Boolean(resultIdByExam[e.id]);
      const attemptDone =
        attempt && DONE_ATTEMPT_STATUSES.includes((attempt.status || "").toLowerCase());
      const studentFinished = Boolean(attemptDone || hasResult);

      if (studentFinished || ["completed", "closed"].includes(String(e.status).toLowerCase())) {
        doneList.push(e);
        continue;
      }

      const avail = examAvailability(e.status, e.scheduled_start, e.scheduled_end);
      if (avail === "available") {
        liveList.push(e);
      } else if (avail === "missed") {
        doneList.push(e);
      } else if (avail === "upcoming") {
        upList.push(e);
      } else {
        doneList.push(e);
      }
    }

    return { live: liveList, upcoming: upList, done: doneList };
  }, [exams, attemptByExam, resultIdByExam, tick]);

  if (sLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!student) {
    return (
      <EmptyState
        title="Student profile not found"
        description="Contact School Admin to link your account."
      />
    );
  }

  const termLine = [student.sessionName, student.semesterName].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title="My Examinations"
        description={
          termLine
            ? `${termLine} · Only officer-approved exams appear here.`
            : "You only see exams after the Examination Officer has approved them."
        }
      />

      {examsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading examinations…</p>
      ) : exams.length === 0 ? (
        <EmptyState
          title="No examinations available"
          description="When your lecturers submit exams and the officer approves them, they will appear here."
        />
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <SectionCard title="Available now">
            {live.length === 0 ? (
              <p className="text-sm text-slate-500">No exams available to start right now.</p>
            ) : (
              <ExamList
                items={live}
                canStart
                attemptByExam={attemptByExam}
                resultIdByExam={resultIdByExam}
                sessionName={student.sessionName}
                semesterName={student.semesterName}
              />
            )}
          </SectionCard>
          <SectionCard title="Upcoming">
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming examinations.</p>
            ) : (
              <ExamList
                items={upcoming}
                attemptByExam={attemptByExam}
                resultIdByExam={resultIdByExam}
                sessionName={student.sessionName}
                semesterName={student.semesterName}
                showCountdown
              />
            )}
          </SectionCard>
          <SectionCard title="Completed / missed">
            {done.length === 0 ? (
              <p className="text-sm text-slate-500">No completed examinations yet.</p>
            ) : (
              <ExamList
                items={done}
                attemptByExam={attemptByExam}
                resultIdByExam={resultIdByExam}
                completed
                sessionName={student.sessionName}
                semesterName={student.semesterName}
              />
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}

function ExamList({
  items,
  canStart,
  completed,
  showCountdown,
  attemptByExam,
  resultIdByExam,
  sessionName,
  semesterName,
}: {
  items: ExamRow[];
  canStart?: boolean;
  completed?: boolean;
  showCountdown?: boolean;
  attemptByExam: Map<string, AttemptRow>;
  resultIdByExam: Record<string, string>;
  sessionName?: string | null;
  semesterName?: string | null;
}) {
  const navigate = useNavigate();
  return (
    <ul className="space-y-3">
      {items.map((e) => {
        const attempt = attemptByExam.get(e.id);
        const resultId = resultIdByExam[e.id];
        const attemptDone =
          attempt && DONE_ATTEMPT_STATUSES.includes((attempt.status || "").toLowerCase());
        const studentFinished = Boolean(attemptDone || resultId);
        const avail = examAvailability(e.status, e.scheduled_start, e.scheduled_end);
        const badge = studentFinished
          ? attempt?.status === "terminated"
            ? "terminated"
            : "completed"
          : avail === "missed"
            ? "missed"
            : String(e.status).replaceAll("_", " ");

        const windowText =
          e.scheduled_start || e.scheduled_end
            ? formatExamWindow(e.scheduled_start, e.scheduled_end)
            : "Schedule TBC";
        const term =
          [sessionName, semesterName].filter(Boolean).join(" · ") || null;

        return (
          <li
            key={e.id}
            className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm sm:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-snug text-slate-900">{e.title}</p>
                <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm">
                  <span className="font-semibold text-primary">{e.courses?.code ?? "—"}</span>
                  {e.courses?.name ? ` · ${e.courses.name}` : ""}
                </p>
              </div>
              <StatusBadge status={badge} className="shrink-0" />
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-100">
                {e.duration_minutes} min
              </span>
              {term ? (
                <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-100">
                  {term}
                </span>
              ) : null}
            </div>

            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{windowText}</span>
            </p>
            {attempt?.submitted_at ? (
              <p className="mt-1 text-[11px] font-medium text-emerald-700 sm:text-xs">
                Submitted {new Date(attempt.submitted_at).toLocaleString()}
              </p>
            ) : null}

            <div className="mt-3 flex flex-col gap-2 border-t border-slate-50 pt-3 sm:flex-row sm:items-center sm:justify-end">
              {canStart && !studentFinished && (
                <StartOrCountdownButton
                  examId={e.id}
                  scheduledStart={e.scheduled_start}
                  canStartNow
                />
              )}
              {showCountdown && !studentFinished && (
                <StartOrCountdownButton
                  examId={e.id}
                  scheduledStart={e.scheduled_start}
                  canStartNow={false}
                />
              )}
              {completed && studentFinished && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-full font-semibold sm:h-8 sm:w-auto"
                  type="button"
                  onClick={() => {
                    void navigate({
                      to: "/student/results/$id",
                      params: { id: resultId || e.id },
                    });
                  }}
                >
                  View result
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
