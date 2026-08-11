import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";
import { CheckSquare, Radio, ShieldAlert, FileText } from "lucide-react";

export const Route = createFileRoute("/officer/")({
  head: () => ({
    meta: [{ title: "Examination Officer Dashboard — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader
        title="Welcome, Examination Officer"
        description={`${mock.currentOfficer.name} · ${mock.currentOfficer.school}`}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Pending Approvals" value={12} icon={CheckSquare} color="bg-violet-50 text-violet-600" />
        <Stat label="Live Examinations" value={7} icon={Radio} color="bg-blue-50 text-blue-600" />
        <Stat label="Flagged Attempts" value={18} icon={ShieldAlert} color="bg-red-50 text-red-600" />
        <Stat label="Results Pending" value={23} icon={FileText} color="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Live Examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/live-monitor">View All</Link>
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
                  <p className="text-xs text-slate-500">{e.questions} Students · In Progress</p>
                </div>
                <StatusBadge status="ongoing" />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Integrity Alerts"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/integrity">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {mock.integrityEvents.slice(0, 4).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {e.student} · {e.exam}
                  </p>
                  <p className="text-xs text-slate-500">{e.event}</p>
                </div>
                <StatusBadge status={e.severity} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Examination Approvals"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/approvals">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {mock.studentExams.slice(0, 2).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{e.code} — {e.title}</p>
                  <p className="text-xs text-slate-500">By {mock.currentTeacher.name}</p>
                </div>
                <StatusBadge status="pending" />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Recent Reports"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/reports">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {mock.auditLogs.slice(0, 3).map((l) => (
              <li key={l.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <p className="text-sm font-semibold text-slate-900">{l.action}</p>
                <p className="text-xs text-slate-500">{l.time}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
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
