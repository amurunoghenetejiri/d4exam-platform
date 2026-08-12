import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, BookOpen, Bell, BarChart3 } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useCount, useRows } from "@/lib/queries";
import { useSessionUser } from "@/lib/session";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [{ title: "Student Dashboard — D4EXAM" }],
  }),
  component: Page,
});

type Exam = {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  duration_minutes: number;
};

type Notif = {
  id: string;
  title: string;
  created_at: string;
  read_at: string | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const enabled = Boolean(schoolId);

  const totalExams = useCount("examinations", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);
  const courses = useCount("courses", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);

  const exams = useRows<Exam>({
    table: "examinations",
    select: "id, title, status, scheduled_start, duration_minutes",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "scheduled_start", ascending: true },
    limit: 8,
    enabled,
  });

  const notifications = useRows<Notif>({
    table: "notifications",
    select: "id, title, created_at, read_at",
    filters: user?.userId ? [{ column: "recipient_user_id", value: user.userId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 20,
    enabled: Boolean(user?.userId),
  });

  const upcoming = (exams.data ?? []).filter((e) => e.status !== "completed");
  const completed = (exams.data ?? []).filter((e) => e.status === "completed").length;
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title={`Welcome back${user?.fullName ? `, ${user.fullName}` : ""}`}
        description={[user?.identifier, user?.schoolName].filter(Boolean).join(" · ") || "Student dashboard"}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat label="Upcoming exams" value={upcoming.length} icon={CalendarClock} color="bg-blue-50 text-blue-600" />
        <MiniStat label="Completed (listed)" value={completed} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600" />
        <MiniStat label="School exams" value={totalExams.isLoading ? "…" : totalExams.data ?? 0} icon={BarChart3} color="bg-violet-50 text-violet-600" />
        <MiniStat label="Courses" value={courses.isLoading ? "…" : courses.data ?? 0} icon={BookOpen} color="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">View All</Link>
            </Button>
          }
        >
          {(exams.data ?? []).length === 0 ? (
            <EmptyState title="No examinations" description="When your school schedules exams, they will show here." />
          ) : (
            <ul className="space-y-3">
              {(exams.data ?? []).map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{e.title}</p>
                      <StatusBadge status={e.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {e.scheduled_start ? new Date(e.scheduled_start).toLocaleString() : "Not scheduled"} ·{" "}
                      {e.duration_minutes} minutes
                    </p>
                  </div>
                  {e.status !== "completed" && (
                    <Button size="sm" className="shrink-0 font-semibold" asChild>
                      <Link to="/student/exam/$id" params={{ id: e.id }}>
                        Start Exam
                      </Link>
                    </Button>
                  )}
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
          {(notifications.data ?? []).length === 0 ? (
            <EmptyState title="No notifications" description="Messages sent to your account will appear here." />
          ) : (
            <ul className="space-y-3">
              {(notifications.data ?? []).slice(0, 6).map((n) => (
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
        <QuickTile to="/student/courses" label="Courses" value={courses.data ?? 0} icon={BookOpen} sub="In school catalogue" />
        <QuickTile to="/student/notifications" label="Unread" value={unread} icon={Bell} sub="Notifications" />
        <QuickTile to="/student/examinations" label="Exams" value={totalExams.data ?? 0} icon={CalendarClock} sub="Listed for school" />
      </div>
    </>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function QuickTile({
  to,
  label,
  value,
  icon: Icon,
  sub,
}: {
  to: string;
  label: string;
  value: number;
  icon: any;
  sub: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
    </Link>
  );
}
