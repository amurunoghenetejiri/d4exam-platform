import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Building2, GraduationCap, Users, FileText } from "lucide-react";
import { useCount, useRows } from "@/lib/queries";
import { useSessionUser } from "@/lib/session";

export const Route = createFileRoute("/super-admin/")({
  head: () => ({
    meta: [{ title: "Super Admin Dashboard — D4EXAM" }],
  }),
  component: Page,
});

type Application = {
  id: string;
  school_name: string;
  country: string | null;
  status: string;
  created_at: string;
};

type School = {
  id: string;
  subscription_plan: string;
};

function Page() {
  const { data: user } = useSessionUser();
  const schools = useCount("schools");
  const students = useCount("students");
  const teachers = useCount("teachers");
  const examinations = useCount("examinations");

  const apps = useRows<Application>({
    table: "school_applications",
    select: "id, school_name, country, status, created_at",
    order: { column: "created_at", ascending: false },
    limit: 8,
  });

  const schoolRows = useRows<School>({
    table: "schools",
    select: "id, subscription_plan",
    limit: 500,
  });

  const planCounts = (schoolRows.data ?? []).reduce<Record<string, number>>((acc, s) => {
    const key = (s.subscription_plan || "free").toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const planList = Object.entries(planCounts).map(([plan, count]) => ({
    plan: plan.charAt(0).toUpperCase() + plan.slice(1),
    count,
    color:
      plan.includes("enter") ? "bg-emerald-500" : plan.includes("pro") ? "bg-blue-500" : "bg-slate-400",
  }));

  return (
    <>
      <PageHeader
        title={`Welcome back${user?.fullName ? `, ${user.fullName}` : ", Super Administrator"}`}
        description="Platform-wide schools, users and examinations from your database"
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Schools" value={schools.isLoading ? "…" : String(schools.data ?? 0)} icon={Building2} />
        <Stat label="Students" value={students.isLoading ? "…" : String(students.data ?? 0)} icon={GraduationCap} />
        <Stat label="Teachers" value={teachers.isLoading ? "…" : String(teachers.data ?? 0)} icon={Users} />
        <Stat label="Examinations" value={examinations.isLoading ? "…" : String(examinations.data ?? 0)} icon={FileText} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Recent school applications"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/super-admin/applications">View All</Link>
            </Button>
          }
        >
          {(apps.data ?? []).length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="School applications from the database will appear here."
            />
          ) : (
            <ul className="space-y-3">
              {(apps.data ?? []).map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{a.school_name}</p>
                    <p className="text-xs text-slate-500">
                      {a.country || "—"} · {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Schools by plan">
          {planList.length === 0 ? (
            <EmptyState
              title="No schools yet"
              description="Approved schools and their subscription plans will show here."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {planList.map((p) => (
                <div key={p.plan} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${p.color}`} />
                    <p className="text-sm font-semibold text-slate-700">{p.plan}</p>
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{p.count}</p>
                </div>
              ))}
            </div>
          )}
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
