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

function Page() {
  const { data: student, isLoading: sLoading } = useStudentContext();
  const schoolId = student?.schoolId ?? null;

  const examsQ = useQuery({
    queryKey: ["student-exams", schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(schoolId),
    refetchInterval: 15_000,
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

  const exams = examsQ.data ?? [];

  const { live, upcoming, done } = useMemo(() => {
    const liveList = exams.filter((e) => canStartExam(e.status, e.scheduled_start));
    const doneList = exams.filter((e) => ["completed", "closed"].includes(e.status));
    const up = exams.filter(
      (e) => !liveList.some((x) => x.id === e.id) && !doneList.some((x) => x.id === e.id),
    );
    return { live: liveList, upcoming: up, done: doneList };
  }, [exams]);

  if (sLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!student) {
    return (
      <EmptyState
        title="Student profile not found"
        description="Contact School Admin to link your account."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="My Examinations"
        description="You only see exams after the Examination Officer has approved them. Drafts and pending submissions are hidden."
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
              <ExamList items={live} canStart />
            </SectionCard>
          )}
          <SectionCard title="Upcoming">
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming examinations.</p>
            ) : (
              <ExamList items={upcoming} />
            )}
          </SectionCard>
          <SectionCard title="Completed">
            {done.length === 0 ? (
              <p className="text-sm text-slate-500">No completed examinations yet.</p>
            ) : (
              <ExamList items={done} />
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}

function ExamList({ items, canStart }: { items: ExamRow[]; canStart?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((e) => (
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
              {e.scheduled_start
                ? `Starts ${new Date(e.scheduled_start).toLocaleString()}`
                : "Schedule TBC"}
              {e.scheduled_end ? ` · Ends ${new Date(e.scheduled_end).toLocaleString()}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={String(e.status).replaceAll("_", " ")} />
            {canStart && (
              <Button size="sm" className="font-semibold" asChild>
                <Link to="/student/exam/$id" params={{ id: e.id }}>
                  Start Exam
                </Link>
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
