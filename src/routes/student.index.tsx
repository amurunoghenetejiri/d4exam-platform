import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, BookOpen, Bell, Play } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import {
  useStudentContext,
  STUDENT_VISIBLE_EXAM_STATUSES,
  canStartExam,
} from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";

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

  const examsQ = useQuery({
    queryKey: ["student-dashboard-exams", schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(schoolId),
    refetchInterval: 20_000,
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
    refetchInterval: 20_000,
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
  const notifications = notificationsQ.data ?? [];

  const { ready, upcoming, completed } = useMemo(() => {
    const r: ExamRow[] = [];
    const u: ExamRow[] = [];
    const c: ExamRow[] = [];
    for (const e of exams) {
      const att = attemptByExam.get(e.id);
      const finished = att && DONE.includes((att.status || "").toLowerCase());
      if (finished) {
        c.push(e);
        continue;
      }
      if (["completed", "closed"].includes(e.status)) {
        c.push(e);
        continue;
      }
      if (canStartExam(e.status, e.scheduled_start)) r.push(e);
      else u.push(e);
    }
    return { ready: r, upcoming: u, completed: c };
  }, [exams, attemptByExam]);

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
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat to="/student/examinations" label="Ready to start" value={ready.length} icon={Play} color="bg-emerald-50 text-emerald-600" />
        <MiniStat to="/student/examinations" label="Upcoming" value={upcoming.length} icon={CalendarClock} color="bg-blue-50 text-blue-600" />
        <MiniStat to="/student/results" label="Completed" value={completed.length} icon={CheckCircle2} color="bg-violet-50 text-violet-600" />
        <MiniStat to="/student/courses" label="My courses" value={student?.courses.length ?? 0} icon={BookOpen} color="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Ready to start"
          description="Exams you can write now (not yet submitted)"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">View All</Link>
            </Button>
          }
        >
          {examsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : ready.length === 0 ? (
            <EmptyState title="No exams ready" description="When an exam is approved and the start time is reached, it appears here." />
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
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-500">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <QuickTile to="/student/courses" label="Courses" value={student?.courses.length ?? 0} icon={BookOpen} sub="My programme" />
        <QuickTile to="/student/notifications" label="Unread" value={unread} icon={Bell} sub="Notifications" />
        <QuickTile to="/student/examinations" label="Upcoming" value={upcoming.length} icon={CalendarClock} sub="Not yet open" />
      </div>
    </>
  );
}

function MiniStat({ to, label, value, icon: Icon, color }: { to: string; label: string; value: string | number; icon: typeof Play; color: string }) {
  return (
    <Link to={to} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
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

function QuickTile({ to, label, value, icon: Icon, sub }: { to: string; label: string; value: number; icon: typeof BookOpen; sub: string }) {
  return (
    <Link to={to} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
    </Link>
  );
}
