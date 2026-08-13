import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import {
  useStudentContext,
  STUDENT_VISIBLE_EXAM_STATUSES,
  canStartExam,
} from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/examinations")({
  head: () => ({
    meta: [
      { title: "My Examinations — D4EXAM" },
      {
        name: "description",
        content:
          "Only examinations approved by the Examination Officer appear here.",
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

function Page() {
  const { data: student, isLoading: sLoading } = useStudentContext();
  const schoolId = student?.schoolId ?? null;

  const examsQ = useQuery({
    queryKey: ["student-exams", schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(schoolId),
    staleTime: 15_000,
    refetchInterval: 45_000,
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
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["student-attempts", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 15_000,
    refetchInterval: 45_000,
    queryFn: async () => {
      if (!student?.studentId) return [] as AttemptRow[];
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("exam_id, status, submitted_at")
        .eq("student_id", student.studentId);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["student-result-ids", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 20_000,
    queryFn: async () => {
      if (!student?.studentId) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("results")
        .select("id, exam_id")
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId);
      if (error) throw error;
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

  const { live, upcoming, done } = useMemo(() => {
    const liveList: ExamRow[] = [];
    const upList: ExamRow[] = [];
    const doneList: ExamRow[] = [];

    for (const e of exams) {
      const attempt = attemptByExam.get(e.id);
      const studentFinished =
        attempt && DONE_ATTEMPT_STATUSES.includes((attempt.status || "").toLowerCase());

      if (studentFinished || ["completed", "closed"].includes(e.status)) {
        doneList.push(e);
        continue;
      }

      if (canStartExam(e.status, e.scheduled_start)) {
        liveList.push(e);
      } else {
        upList.push(e);
      }
    }

    return { live: liveList, upcoming: upList, done: doneList };
  }, [exams, attemptByExam]);

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
        <div className="space-y-6">
          {live.length > 0 && (
            <SectionCard title="Available now">
              <ExamList
                items={live}
                canStart
                attemptByExam={attemptByExam}
                resultIdByExam={resultIdByExam}
                sessionName={student.sessionName}
                semesterName={student.semesterName}
              />
            </SectionCard>
          )}
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
              />
            )}
          </SectionCard>
          <SectionCard title="Completed">
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
  attemptByExam,
  resultIdByExam,
  sessionName,
  semesterName,
}: {
  items: ExamRow[];
  canStart?: boolean;
  completed?: boolean;
  attemptByExam: Map<string, AttemptRow>;
  resultIdByExam: Record<string, string>;
  sessionName?: string | null;
  semesterName?: string | null;
}) {
  return (
    <ul className="space-y-3">
      {items.map((e) => {
        const attempt = attemptByExam.get(e.id);
        const studentFinished =
          attempt && DONE_ATTEMPT_STATUSES.includes((attempt.status || "").toLowerCase());
        const badge = studentFinished
          ? attempt!.status === "terminated"
            ? "terminated"
            : "completed"
          : String(e.status).replaceAll("_", " ");
        const resultId = resultIdByExam[e.id];

        return (
          <li
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
              <p className="text-xs text-slate-500">
                {e.courses?.code ?? "—"} · {e.courses?.name ?? ""} · {e.duration_minutes} min
              </p>
              <p className="text-xs text-slate-400">
                {[sessionName, semesterName].filter(Boolean).join(" · ")}
                {sessionName || semesterName ? " · " : ""}
                {e.scheduled_start
                  ? `Starts ${new Date(e.scheduled_start).toLocaleString()}`
                  : "Schedule TBC"}
                {attempt?.submitted_at
                  ? ` · Submitted ${new Date(attempt.submitted_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={badge} />
              {canStart && !studentFinished && (
                <Button size="sm" className="font-semibold" asChild>
                  <Link to="/student/exam/$id" params={{ id: e.id }}>
                    Start Exam
                  </Link>
                </Button>
              )}
              {completed && studentFinished && (
                <Button size="sm" variant="outline" className="font-semibold" asChild>
                  {resultId ? (
                    <Link to="/student/results/$id" params={{ id: resultId }}>
                      View Result
                    </Link>
                  ) : (
                    <Link to="/student/results">View Result</Link>
                  )}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
