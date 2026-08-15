import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  BookOpen,
  Bell,
  Play,
  Trophy,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import {
  useStudentContext,
  STUDENT_VISIBLE_EXAM_STATUSES,
  canStartExam,
  examAvailability,
  formatExamWindow,
} from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [{ title: "Student Dashboard — D4EXAM" }],
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

type AttemptRow = { exam_id: string; status: string };

type ResultRow = {
  id: string;
  exam_id: string;
  percentage: number | null;
  grade: string | null;
  pass_fail: string | null;
  status: string;
  created_at: string | null;
  examinations: { title: string; courses: { code: string } | null } | null;
};

type Notif = {
  id: string;
  title: string;
  created_at: string;
  read_at: string | null;
};

const DONE = ["submitted", "terminated", "flagged"];

function OpenExamLink({ examId }: { examId: string }) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      size="sm"
      className="font-semibold text-base"
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void navigate({ to: "/student/exam/$id", params: { id: examId } });
      }}
    >
      Open exam
    </Button>
  );
}

function Page() {
  const { data: user } = useSessionUser();
  const { data: student, isLoading: sLoading } = useStudentContext();
  const schoolId = student?.schoolId ?? user?.schoolId ?? null;

  useRealtimeInvalidate(
    `student-dash-${student?.studentId ?? "x"}`,
    [
      { table: "examinations", filter: schoolId ? `school_id=eq.${schoolId}` : undefined },
      { table: "exam_attempts" },
      { table: "results" },
      { table: "notifications" },
    ].filter((t) => t.filter !== undefined || t.table !== "examinations"),
    [
      ["student-dashboard-exams"],
      ["student-dashboard-attempts"],
      ["student-dashboard-results"],
      ["student-dashboard-notifs"],
    ],
    Boolean(student?.studentId),
  );

  const examsQ = useQuery({
    queryKey: ["student-dashboard-exams", schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(schoolId),
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!schoolId) return [] as ExamRow[];
      const q = supabase
        .from("examinations")
        .select(
          "id, title, status, scheduled_start, scheduled_end, duration_minutes, course_id, courses(code, name)",
        )
        .eq("school_id", schoolId)
        .in("status", [...STUDENT_VISIBLE_EXAM_STATUSES])
        .order("scheduled_start", { ascending: true, nullsFirst: false })
        .limit(40);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ExamRow[];
      const courseIds = new Set(student?.courseIds ?? []);
      if (courseIds.size === 0) return rows;
      return rows.filter((e) => !e.course_id || courseIds.has(e.course_id));
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["student-dashboard-attempts", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("exam_id, status")
        .eq("student_id", student!.studentId);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["student-dashboard-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, percentage, grade, pass_fail, status, created_at, examinations(title, courses(code))",
        )
        .eq("student_id", student!.studentId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const notifsQ = useQuery({
    queryKey: ["student-dashboard-notifs", user?.userId],
    enabled: Boolean(user?.userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, created_at, read_at")
        .eq("user_id", user!.userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const attemptsByExam = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of attemptsQ.data ?? []) m.set(a.exam_id, a.status);
    return m;
  }, [attemptsQ.data]);

  const ready = useMemo(() => {
    const r: ExamRow[] = [];
    for (const e of examsQ.data ?? []) {
      const st = attemptsByExam.get(e.id);
      if (st && DONE.includes(st)) continue;
      if (canStartExam(e.status, e.scheduled_start, e.scheduled_end)) r.push(e);
    }
    return r;
  }, [examsQ.data, attemptsByExam]);

  const upcoming = useMemo(() => {
    const r: ExamRow[] = [];
    for (const e of examsQ.data ?? []) {
      if (examAvailability(e.status, e.scheduled_start, e.scheduled_end) === "upcoming") r.push(e);
    }
    return r;
  }, [examsQ.data]);

  const results = resultsQ.data ?? [];
  const notifications = notifsQ.data ?? [];

  if (sLoading) {
    return <p className="text-sm text-slate-500">Loading your dashboard…</p>;
  }

  return (
    <>
      <PageHeader
        title={student?.fullName ? `Welcome, ${student.fullName.split(" ")[0]}` : "Student dashboard"}
        description={
          [student?.sessionName, student?.semesterName, student?.departmentName]
            .filter(Boolean)
            .join(" · ") || "Your examinations, results and notifications"
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat to="/student/examinations" label="Ready to start" value={ready.length} icon={Play} color="bg-emerald-50 text-emerald-600" />
        <MiniStat to="/student/examinations" label="Upcoming" value={upcoming.length} icon={CalendarClock} color="bg-blue-50 text-blue-600" />
        <MiniStat to="/student/results" label="Results" value={results.length} icon={Trophy} color="bg-amber-50 text-amber-600" />
        <MiniStat to="/student/courses" label="Courses" value={student?.courses?.length ?? 0} icon={BookOpen} color="bg-violet-50 text-violet-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Ready to start"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">View All</Link>
            </Button>
          }
        >
          {ready.length === 0 ? (
            <EmptyState title="No exams ready" description="Approved exams in the open window appear here." />
          ) : (
            <ul className="space-y-3">
              {ready.slice(0, 3).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.courses?.code ? `${e.courses.code} · ` : ""}
                      {formatExamWindow(e.scheduled_start, e.scheduled_end)}
                    </p>
                  </div>
                  <OpenExamLink examId={e.id} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent results"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/results">View All</Link>
            </Button>
          }
        >
          {results.length === 0 ? (
            <EmptyState title="No results yet" description="Published results will show here after officer release." />
          ) : (
            <ul className="space-y-2">
              {results.slice(0, 3).map((r) => {
                const isPub = (r.status || "").toLowerCase() === "published";
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {r.examinations?.courses?.code ? `${r.examinations.courses.code} · ` : ""}
                        {r.examinations?.title ?? "Exam"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isPub
                          ? `${r.percentage != null ? `${r.percentage}%` : "—"}${r.grade ? ` · ${r.grade}` : ""}`
                          : "Held for review"}
                      </p>
                    </div>
                    <StatusBadge status={isPub ? "published" : "pending"} />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Upcoming"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">Examinations</Link>
            </Button>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing upcoming" description="Scheduled exams that have not opened yet." />
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 3).map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-900">{e.title}</span>
                  <span className="text-xs text-slate-500">
                    {e.scheduled_start ? new Date(e.scheduled_start).toLocaleString() : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Notifications"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/notifications">View All</Link>
            </Button>
          }
        >
          {notifications.length === 0 ? (
            <EmptyState title="No notifications" description="Messages sent to your account will appear here." />
          ) : (
            <ul className="space-y-3">
              {notifications.slice(0, 3).map((n) => (
                <li key={n.id} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className={`text-sm ${n.read_at ? "font-medium" : "font-semibold"} text-slate-900`}>{n.title}</p>
                    <p className="text-xs text-slate-500">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function MiniStat({
  to,
  label,
  value,
  icon: Icon,
  color,
}: {
  to: string;
  label: string;
  value: string | number;
  icon: typeof Play;
  color: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
