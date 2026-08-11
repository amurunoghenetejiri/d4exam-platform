import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, SectionCard, StatusBadge, DataTable } from "@/components/dashboard/kit";
import { TrendChart, DistributionChart } from "@/components/charts/Charts";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";
import { Users, FileText, GraduationCap, ShieldAlert, Building2, CheckSquare, BookOpen, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "School Admin Dashboard — D4EXAM" },
      { name: "description", content: "Institution-wide students, staff, courses and examination activity." },
      { property: "og:title", content: "School Admin Dashboard — D4EXAM" },
      { property: "og:description", content: "Institution-wide students, staff, courses and examination activity." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="School Admin Dashboard" description="Institution-wide students, staff, courses and examination activity." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value="4,820" icon={GraduationCap} />
        <StatCard label="Teachers" value={186} icon={Users} tone="aqua" />
        <StatCard label="Courses" value={320} icon={BookOpen} tone="info" />
        <StatCard label="Active exams" value={14} icon={FileText} tone="warning" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_minmax(0,1fr)]">
        <SectionCard title="Examination activity" description="Last 7 days">
          <TrendChart data={mock.activityTrend} />
        </SectionCard>
        <SectionCard title="Today's examinations" action={<Button variant="ghost" size="sm" asChild><Link to="/admin/examinations">See all</Link></Button>}>
          <ul className="space-y-3">
            {mock.studentExams.map((e) => (
              <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.code} — {e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.date}</p>
                </div>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
