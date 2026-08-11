import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { TrendChart } from "@/components/charts/Charts";
import * as mock from "@/data/mock";
import { Building2, GraduationCap, Users, FileText } from "lucide-react";

export const Route = createFileRoute("/super-admin/")({
  head: () => ({
    meta: [{ title: "Super Admin Dashboard — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader
        title="Welcome back, Super Administrator"
        description="Platform-wide schools, users and examinations"
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Schools" value="182" icon={Building2} />
        <Stat label="Students" value="84,291" icon={GraduationCap} />
        <Stat label="Teachers" value="4,291" icon={Users} />
        <Stat label="Examinations" value="12,482" icon={FileText} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Examination Overview" description="Daily examination volume">
          <TrendChart data={mock.activityTrend} />
        </SectionCard>

        <SectionCard
          title="Recent Activities"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/super-admin/applications">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {mock.schoolApplications.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.country} · {a.date}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Schools by Plan">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { plan: "Enterprise", count: 45, color: "bg-emerald-500" },
              { plan: "Professional", count: 82, color: "bg-blue-500" },
              { plan: "Free", count: 55, color: "bg-slate-400" },
            ].map((p) => (
              <div key={p.plan} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${p.color}`} />
                  <p className="text-sm font-semibold text-slate-700">{p.plan}</p>
                </div>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">{p.count}</p>
              </div>
            ))}
          </div>
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
