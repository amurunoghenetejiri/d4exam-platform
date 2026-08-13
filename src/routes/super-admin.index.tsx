import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  GraduationCap,
  Users,
  FileText,
  UserCheck,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";

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
  name: string;
  subscription_plan: string | null;
  created_at: string | null;
};

function Page() {
  const { data: user } = useSessionUser();

  useRealtimeInvalidate(
    "sa-dashboard",
    [
      { table: "schools" },
      { table: "profiles" },
      { table: "students" },
      { table: "examinations" },
      { table: "school_applications" },
    ],
    [["sa-dash-counts"], ["sa-dash-apps"], ["sa-dash-schools"], ["sa-dash-exams-month"]],
    true,
  );

  const countsQ = useQuery({
    queryKey: ["sa-dash-counts"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [schools, students, exams, profiles, completed] = await Promise.all([
        supabase.from("schools").select("id", { count: "exact", head: true }),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("examinations").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("examinations")
          .select("id", { count: "exact", head: true })
          .in("status", ["completed", "closed"]),
      ]);

      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "teacher")
        .limit(5000);
      const teachers = new Set((roleRows ?? []).map((r) => r.user_id as string)).size;

      return {
        schools: schools.count ?? 0,
        students: students.count ?? 0,
        exams: exams.count ?? 0,
        users: profiles.count ?? 0,
        teachers,
        completed: completed.count ?? 0,
      };
    },
  });

  const appsQ = useQuery({
    queryKey: ["sa-dash-apps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_applications")
        .select("id, school_name, country, status, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as Application[];
    },
  });

  const schoolsQ = useQuery({
    queryKey: ["sa-dash-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, subscription_plan, created_at")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as School[];
    },
  });

  const examsMonthQ = useQuery({
    queryKey: ["sa-dash-exams-month"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select("id, created_at, status, school_id")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = countsQ.data;

  const planList = useMemo(() => {
    const planCounts = (schoolsQ.data ?? []).reduce<Record<string, number>>((acc, s) => {
      const key = (s.subscription_plan || "free").toLowerCase();
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(planCounts).map(([plan, count]) => ({
      plan: plan.charAt(0).toUpperCase() + plan.slice(1),
      count,
      color:
        plan.includes("enter")
          ? "bg-emerald-500"
          : plan.includes("pro")
            ? "bg-blue-500"
            : "bg-slate-400",
    }));
  }, [schoolsQ.data]);

  const schoolGrowth = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const s of schoolsQ.data ?? []) {
      if (!s.created_at) continue;
      const d = new Date(s.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth[key] = (byMonth[key] ?? 0) + 1;
    }
    const keys = Object.keys(byMonth).sort();
    let running = 0;
    return keys.map((k) => {
      running += byMonth[k];
      return { month: k, new: byMonth[k], total: running };
    });
  }, [schoolsQ.data]);

  const examActivity = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const e of examsMonthQ.data ?? []) {
      const created = (e as { created_at?: string }).created_at;
      if (!created) continue;
      const d = new Date(created);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth[key] = (byMonth[key] ?? 0) + 1;
    }
    return Object.keys(byMonth)
      .sort()
      .map((k) => ({ month: k, exams: byMonth[k] }));
  }, [examsMonthQ.data]);

  const schoolComparison = useMemo(() => {
    const examBySchool: Record<string, number> = {};
    for (const e of examsMonthQ.data ?? []) {
      const sid = (e as { school_id?: string }).school_id;
      if (!sid) continue;
      examBySchool[sid] = (examBySchool[sid] ?? 0) + 1;
    }
    const nameById = new Map((schoolsQ.data ?? []).map((s) => [s.id, s.name]));
    return Object.entries(examBySchool)
      .map(([id, exams]) => ({
        name: (nameById.get(id) || id).slice(0, 16),
        exams,
      }))
      .sort((a, b) => b.exams - a.exams)
      .slice(0, 8);
  }, [examsMonthQ.data, schoolsQ.data]);

  return (
    <>
      <PageHeader
        title={`Welcome back${user?.fullName ? `, ${user.fullName}` : ", Super Administrator"}`}
        description="Realtime platform metrics from your database"
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Schools" value={countsQ.isLoading ? "…" : String(counts?.schools ?? 0)} icon={Building2} />
        <Stat label="Users" value={countsQ.isLoading ? "…" : String(counts?.users ?? 0)} icon={Users} />
        <Stat label="Students" value={countsQ.isLoading ? "…" : String(counts?.students ?? 0)} icon={GraduationCap} />
        <Stat label="Teachers" value={countsQ.isLoading ? "…" : String(counts?.teachers ?? 0)} icon={UserCheck} />
        <Stat label="Exams" value={countsQ.isLoading ? "…" : String(counts?.exams ?? 0)} icon={FileText} />
        <Stat label="Completed exams" value={countsQ.isLoading ? "…" : String(counts?.completed ?? 0)} icon={CheckCircle2} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="School growth" description="Cumulative schools by month">
          {schoolGrowth.length === 0 ? (
            <EmptyState title="No school data" description="Approved schools will chart here." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={schoolGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} name="Schools" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Exam activity" description="Exams created by month">
          {examActivity.length === 0 ? (
            <EmptyState title="No exam activity" description="Examination activity charts here." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={examActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="exams" fill="#0ea5e9" radius={[6, 6, 0, 0]} name="Exams" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="School comparison" description="Exams per school (top 8)">
          {schoolComparison.length === 0 ? (
            <EmptyState title="No comparison data" description="When schools run exams, they rank here." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={schoolComparison} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="exams" fill="#8b5cf6" radius={[0, 6, 6, 0]} name="Exams" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Schools by plan">
          {planList.length === 0 ? (
            <EmptyState title="No schools yet" description="Approved schools and plans show here." />
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

      <div className="mt-6">
        <SectionCard
          title="Recent school applications"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/super-admin/applications">View All</Link>
            </Button>
          }
        >
          {(appsQ.data ?? []).length === 0 ? (
            <EmptyState
              title="No applications yet"
              description="School applications from the database will appear here."
            />
          ) : (
            <ul className="space-y-3">
              {(appsQ.data ?? []).map((a) => (
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
      </div>
    </>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Building2 }) {
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
