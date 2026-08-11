import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";
import { GraduationCap, Users, BookOpen, FileText, Bell } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "School Admin Dashboard — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader
        title="School Admin Dashboard"
        description="Example State University · Institutional overview"
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Total Students" value="4,820" icon={GraduationCap} />
        <Stat label="Total Teachers" value="186" icon={Users} />
        <Stat label="Total Courses" value="320" icon={BookOpen} />
        <Stat label="Total Exams" value="42" icon={FileText} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Examinations Overview">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div className="relative grid h-36 w-36 shrink-0 place-items-center">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#22c55e" strokeWidth="4" strokeDasharray="25 100" strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f59e0b" strokeWidth="4" strokeDasharray="28 100" strokeDashoffset="-25" strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray="24 100" strokeDashoffset="-53" strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#8b5cf6" strokeWidth="4" strokeDasharray="17 100" strokeDashoffset="-77" strokeLinecap="round" />
              </svg>
              <div className="absolute text-center">
                <p className="text-2xl font-extrabold text-slate-900">42</p>
                <p className="text-[10px] text-slate-500">Total Exams</p>
              </div>
            </div>
            <ul className="grid flex-1 grid-cols-2 gap-2 text-sm">
              <Legend color="bg-slate-400" label="Draft" value="8 (19%)" />
              <Legend color="bg-amber-400" label="Pending" value="12 (29%)" />
              <Legend color="bg-blue-500" label="Scheduled" value="10 (24%)" />
              <Legend color="bg-violet-500" label="Active" value="7 (17%)" />
              <Legend color="bg-emerald-500" label="Completed" value="5 (12%)" />
            </ul>
          </div>
        </SectionCard>

        <SectionCard title="Recent Activities">
          <ul className="space-y-3">
            {[
              { t: "New student registered", d: "John Doe was added", time: "10 min ago" },
              { t: "Examination scheduled", d: "CSC101 · First Semester", time: "1 hour ago" },
              { t: "Results published", d: "MTH301 · Continuous Assessment", time: "2 hours ago" },
              { t: "New teacher added", d: "Mr. David was added", time: "5 hours ago" },
            ].map((a) => (
              <li key={a.t} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{a.t}</p>
                  <p className="text-xs text-slate-500">{a.d}</p>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">{a.time}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Today's Examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/admin/examinations">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {mock.studentExams.slice(0, 3).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {e.code} — {e.title}
                  </p>
                  <p className="text-xs text-slate-500">{e.date} · {e.questions} Questions</p>
                </div>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="System Notifications"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/admin/notifications">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {mock.notifications.slice(0, 3).map((n) => (
              <li key={n.id} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <p className="text-xs text-slate-500">{n.time}</p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-slate-600">
        {label} <span className="font-semibold text-slate-900">{value}</span>
      </span>
    </li>
  );
}
