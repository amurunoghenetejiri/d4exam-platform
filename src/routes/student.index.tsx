import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  BookOpen,
  TrendingUp,
  MessageSquare,
  Bell,
  BarChart3,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { currentStudent, studentExams, studentResults, studentCourses, notifications } from "@/data/mock";

export const Route = createFileRoute("/student/")({
  head: () => ({
    meta: [{ title: "Student Dashboard — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  const upcoming = studentExams.filter((e) => e.status !== "completed");
  const completed = studentExams.filter((e) => e.status === "completed").length;
  const average =
    Math.round((studentResults.reduce((a, r) => a + r.score, 0) / studentResults.length) * 10) / 10;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${currentStudent.name}`}
        description={`${currentStudent.level} · ${currentStudent.department}`}
      />

      {/* Stat tiles like reference */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat label="Upcoming Exams" value={upcoming.length} icon={CalendarClock} color="bg-blue-50 text-blue-600" />
        <MiniStat label="Completed Exams" value={completed} icon={CheckCircle2} color="bg-emerald-50 text-emerald-600" />
        <MiniStat label="Average Score" value={`${average}%`} icon={TrendingUp} color="bg-violet-50 text-violet-600" />
        <MiniStat label="Total Courses" value={studentCourses.length} icon={BookOpen} color="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Upcoming Examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {upcoming.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-slate-900">
                      {e.code} — {e.title}
                    </p>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {e.date} · {e.questions} Questions · {e.duration} Minutes
                  </p>
                </div>
                <Button size="sm" className="shrink-0 font-semibold" asChild>
                  <Link to="/student/exam/$id" params={{ id: e.code.toLowerCase() }}>
                    Start Exam
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Recent Results"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/results">View All</Link>
            </Button>
          }
        >
          <ul className="divide-y divide-slate-100">
            {studentResults.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{r.course}</p>
                  <p className="truncate text-xs text-slate-500">{r.title}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{r.score}%</p>
                  <p className="text-sm font-bold text-primary">{r.grade}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickTile to="/student/courses" label="My Courses" value={studentCourses.length} icon={BookOpen} sub="Active Courses" />
        <QuickTile to="/student/notifications" label="Messages" value={2} icon={MessageSquare} sub="Unread Messages" />
        <QuickTile to="/student/notifications" label="Notifications" value={notifications.filter((n) => !n.read).length} icon={Bell} sub="New Notifications" />
        <QuickTile to="/student/results" label="Results" value={studentResults.length} icon={BarChart3} sub="Released" />
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
