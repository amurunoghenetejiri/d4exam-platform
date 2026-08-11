import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, SectionCard, StatusBadge, DataTable } from "@/components/dashboard/kit";
import { TrendChart, DistributionChart } from "@/components/charts/Charts";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";
import { Users, FileText, GraduationCap, ShieldAlert, Building2, CheckSquare, BookOpen, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/officer/")({
  head: () => ({
    meta: [
      { title: "Examination Officer Dashboard — D4EXAM" },
      { name: "description", content: "Pending approvals, live examinations, flagged attempts and result approvals." },
      { property: "og:title", content: "Examination Officer Dashboard — D4EXAM" },
      { property: "og:description", content: "Pending approvals, live examinations, flagged attempts and result approvals." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Examination Officer Dashboard" description="Pending approvals, live examinations, flagged attempts and result approvals." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending approvals" value={6} icon={CheckSquare} tone="warning" />
        <StatCard label="Active examinations" value={3} icon={FileText} tone="aqua" />
        <StatCard label="Live candidates" value={412} icon={Users} />
        <StatCard label="Flagged attempts" value={5} icon={ShieldAlert} tone="destructive" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_minmax(0,1fr)]">
        <SectionCard title="Integrity event timeline" action={<Button variant="ghost" size="sm" asChild><Link to="/officer/integrity">Review all</Link></Button>}>
          <ol className="space-y-4">
            {mock.integrityEvents.map((e) => (
              <li key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.event} — {e.student}</p>
                  <p className="text-xs text-muted-foreground">{e.exam} · {e.matric} · {e.time}</p>
                </div>
                <StatusBadge status={e.severity} />
              </li>
            ))}
          </ol>
        </SectionCard>
        <SectionCard title="Result approvals" action={<Button variant="ghost" size="sm" asChild><Link to="/officer/results">Open</Link></Button>}>
          <ul className="space-y-3">
            {mock.studentResults.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <span className="truncate text-sm">{r.course} · {r.title}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
