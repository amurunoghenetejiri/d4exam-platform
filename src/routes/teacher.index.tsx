import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard, SectionCard, StatusBadge, DataTable } from "@/components/dashboard/kit";
import { TrendChart, DistributionChart } from "@/components/charts/Charts";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";
import { Users, FileText, GraduationCap, ShieldAlert, Building2, CheckSquare, BookOpen, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/teacher/")({
  head: () => ({
    meta: [
      { title: "Teacher Dashboard — D4EXAM" },
      { name: "description", content: "Courses, examinations, pending marking and recent submissions." },
      { property: "og:title", content: "Teacher Dashboard — D4EXAM" },
      { property: "og:description", content: "Courses, examinations, pending marking and recent submissions." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader title="Teacher Dashboard" description="Courses, examinations, pending marking and recent submissions." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My courses" value={4} icon={BookOpen} />
        <StatCard label="Total exams" value={8} icon={FileText} tone="info" />
        <StatCard label="Total students" value={420} icon={GraduationCap} tone="aqua" />
        <StatCard label="Pending marking" value={23} icon={ShieldAlert} tone="warning" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_minmax(0,1fr)]">
        <SectionCard title="Recent submissions" action={<Button variant="ghost" size="sm" asChild><Link to="/teacher/submissions">See all</Link></Button>}>
          <DataTable
            rows={mock.submissions}
            columns={[
              { key: "student", header: "Candidate" },
              { key: "matric", header: "Matric", hideOnMobile: true },
              { key: "exam", header: "Exam" },
              { key: "objective", header: "Objective", hideOnMobile: true },
              { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        </SectionCard>
        <SectionCard title="Grade distribution" description="CSC101 · First Semester">
          <DistributionChart data={mock.gradeDistribution} />
        </SectionCard>
      </div>
    </>
  );
}
