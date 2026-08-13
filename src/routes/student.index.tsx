import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  BookOpen,
  Bell,
  Play,
  History,
  Percent,
  Clock,
  Trophy,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import {
  useStudentContext,
  STUDENT_VISIBLE_EXAM_STATUSES,
  canStartExam,
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
      let q = supabase
        .from("examinations")
        .select(
          "id, title, status, scheduled_start, scheduled_end, duration_minutes, course_id, courses(code, name)",
        )
        .eq("school_id", schoolId)
        .in("status", [...STUDENT_VISIBLE_EXAM_STATUSES])
        .order("scheduled_start", { ascending: true, nullsFirst: false })
        .limit(50);

      if (student?.courseIds?.length) {
        q = q.in("course_id", student.courseIds);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["student-dashboard-attempts", student?.studentId],
    enabled: Boolean(student?.studentId),
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!student?.studentId) return [] as AttemptRow[];
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("exam_id, status")
        .eq("student_id", student.studentId);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["student-dashboard-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!student?.studentId) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, percentage, grade, pass_fail, status, created_at, examinations(title, courses(code))",
        )
        .eq("student_id", student.studentId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const notificationsQ = useQuery({
    queryKey: ["student-dashboard-notifs", user?.userId],
    enabled: Boolean(user?.userId),
    queryFn: async () => {
      if (!user?.userId) return [] as Notif[];
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, created_at, read_at")
        .eq("recipient_user_id", user.userId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const attemptByExam = useMemo(() => {
    const m = new Map<string, AttemptRow>();
    for (const a of attemptsQ.data ?? []) m.set(a.exam_id, a);
    return m;
  }, [attemptsQ.data]);

  const exams = examsQ.data ?? [];
  const results = resultsQ.data ?? [];
  const notifications = notificationsQ.data ?? [];

  const { ready, upcoming } = useMemo(() => {
    const r: ExamRow[] = [];
    const u: ExamRow[] = [];
    for (const e of exams) {
      const att = attemptByExam.get(e.id);
      const finished = att && DONE.includes((att.status || "").toLowerCase());
      if (finished) continue;
      if (["completed", "closed"].includes(e.status)) continue;
      if (canStartExam(e.status, e.scheduled_start)) r.push(e);
      else u.push(e);
    }
    return { ready: r, upcoming: u };
  }, [exams, attemptByExam]);

  const written = results.length;
  const published = results.filter((r) => (r.status || "").toLowerCase() === "published");
  const pendingResults = results.filter((r) => (r.status || "").toLowerCase() !== "published");
  const passed = published.filter((r) => (r.pass_fail || "").toLowerCase() === "pass").length;
  const avgScore =
    published.length > 0
      ? Math.round(
          published.reduce((s, r) => s + Number(r.percentage ?? 0), 0) / published.length,
        )
      : null;

  const unread = notifications.filter((n) => !n.read_at).length;

  if (sLoading) return <p className="text-sm text-slate-500">Loading dashboard…</p>;

  return (
    <>
      <PageHeader
        title={`Welcome back${user?.fullName ? `, ${user.fullName}` : ""}`}
        description={
          [student?.matric ?? user?.identifier, user?.schoolName]
            .filter(Boolean)
            .join(" · ") || "Student dashboard"
        }
        actions={
          <Button variant="outline" className="font-semibold" asChild>
            <Link to="/student/history">
              <History className="mr-1.5 h-4 w-4" /> Exam history
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat to="/student/examinations" label="Ready to start" value={ready.length} icon={Play} color="bg-emerald-50 text-emerald-600" />
        <MiniStat to="/student/examinations" label="Upcoming" value={upcoming.length} icon={CalendarClock} color="bg-blue-50 text-blue-600" />
        <MiniStat to="/student/results" label="Exams written" value={written} icon={CheckCircle2} color="bg-violet-50 text-violet-600" />
        <MiniStat to="/student/results" label="Average score" value={avgScore != null ? `${avgScore}%` : "—"} icon={Percent} color="bg-amber-50 text-amber-600" />
        <MiniStat to="/student/results" label="Passed" value={passed} icon={Trophy} color="bg-emerald-50 text-emerald-600" />
        <MiniStat to="/student/results" label="Pending results" value={pendingResults.length} icon={Clock} color="bg-orange-50 text-orange-600" />
        <MiniStat to="/student/courses" label="My courses" value={student?.courses.length ?? 0} icon={BookOpen} color="bg-sky-50 text-sky-600" />
        <MiniStat to="/student/notifications" label="Unread alerts" value={unread} icon={Bell} color="bg-rose-50 text-rose-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Ready to start"
          description="Current exams you can write now"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">View All</Link>
            </Button>
          }
        >
          {examsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : ready.length === 0 ? (
            <EmptyState title="No exams ready" description="When an exam opens, it appears here. Completed exams are in History." />
          ) : (
            <ul className="space-y-3">
              {ready.slice(0, 8).map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{e.title}</p>
                      <StatusBadge status="ready" />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {e.courses?.code ?? "—"} · {e.duration_minutes} min ·{" "}
                      {e.scheduled_start ? `Starts ${new Date(e.scheduled_start).toLocaleString()}` : "Available now"}
                    </p>
                  </div>
                  <Button size="sm" className="shrink-0 font-semibold" asChild>
                    <Link to="/student/exam/$id" params={{ id: e.id }}>Start Exam</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent results"
          description="Latest scores from the database"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/results">All results</Link>
            </Button>
          }
        >
          {resultsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : results.length === 0 ? (
            <EmptyState title="No results yet" description="After you write an exam, results appear here when available." />
          ) : (
            <ul className="space-y-3">
              {results.slice(0, 6).map((r) => {
                const isPub = (r.status || "").toLowerCase() === "published";
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {r.examinations?.courses?.code ? `${r.examinations.courses.code} · ` : ""}
                        {r.examinations?.title ?? "Exam"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isPub
                          ? `${r.percentage != null ? `${Math.round(Number(r.percentage))}%` : "—"}${r.grade ? ` · ${r.grade}` : ""}${(r.pass_fail || "") ? ` · ${r.pass_fail}` : ""}`
                          : "Pending release"}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="font-semibold" asChild>
                      <Link to="/student/results" search={{ id: r.id }}>
                        View Result
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Upcoming"
          description="Scheduled exams not yet open"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">Examinations</Link>
            </Button>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState title="None upcoming" description="No future exams on your courses right now." />
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 5).map((e) => (
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
              {notifications.slice(0, 6).map((n) => (
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
