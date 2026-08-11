import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, SectionCard, StatusBadge, DataTable } from "@/components/dashboard/kit";
import { TrendChart, DistributionChart } from "@/components/charts/Charts";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";
import { Users, FileText, GraduationCap, ShieldAlert, Building2, CheckSquare, BookOpen, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/super-admin/")({
  head: () => ({
    meta: [
      { title: "Platform Overview — D4EXAM" },
      { name: "description", content: "Schools, students, staff and examinations across the entire D4EXAM platform." },
      { property: "og:title", content: "Platform Overview — D4EXAM" },
      { property: "og:description", content: "Schools, students, staff and examinations across the entire D4EXAM platform." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Platform Overview" description="Schools, students, staff and examinations across the entire D4EXAM platform." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Schools" value={182} icon={Building2} />
        <StatCard label="Students" value="84,291" icon={GraduationCap} tone="aqua" />
        <StatCard label="Teachers" value="4,291" icon={Users} tone="info" />
        <StatCard label="Examinations" value="12,482" icon={BarChart3} tone="warning" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_minmax(0,1fr)]">
        <SectionCard title="Platform activity" description="Examinations delivered per day">
          <TrendChart data={mock.activityTrend} />
        </SectionCard>
        <SectionCard title="Recent school registrations" action={<Button variant="ghost" size="sm" asChild><Link to="/super-admin/applications">Applications</Link></Button>}>
          <ul className="space-y-3">
            {mock.schoolApplications.map((a) => (
              <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.country} · {a.date}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
