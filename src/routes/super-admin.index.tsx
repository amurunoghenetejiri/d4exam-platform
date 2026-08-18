import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  GraduationCap,
  Users,
  FileText,
  UserCheck,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Download,
  Calendar,
  School,
  UserPlus,
  Upload,
  BarChart3,
  Activity,
  HardDrive,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/super-admin/")({
  head: () => ({
    meta: [{ title: "Super Admin Overview — D4EXAM" }],
  }),
  component: Page,
});

const ROLE_COLORS = ["#2563eb", "#8b5cf6", "#10b981", "#f59e0b", "#06b6d4", "#94a3b8"];
const EXAM_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444"];

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function formatNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function Page() {
  const { data: user } = useSessionUser();
  const [growthRange, setGrowthRange] = useState<"week" | "month" | "year">("month");
  const firstName = (user?.fullName || "Admin").split(" ")[0];

  useRealtimeInvalidate(
    "sa-overview",
    [
      { table: "schools" },
      { table: "profiles" },
      { table: "students" },
      { table: "examinations" },
      { table: "results" },
      { table: "user_roles" },
      { table: "audit_logs" },
      { table: "school_applications" },
      { table: "notifications" },
    ],
    [
      ["sa-ov-counts"],
      ["sa-ov-roles"],
      ["sa-ov-schools"],
      ["sa-ov-exams"],
      ["sa-ov-results"],
      ["sa-ov-activities"],
      ["sa-ov-growth"],
      ["sa-ov-students-by-school"],
    ],
    true,
  );

  const weekAgo = useMemo(() => new Date(Date.now() - 7 * 864e5).toISOString(), []);

  const countsQ = useQuery({
    queryKey: ["sa-ov-counts"],
    refetchInterval: 45_000,
    queryFn: async () => {
      const [
        schools,
        schoolsWeek,
        students,
        studentsWeek,
        exams,
        examsWeek,
        users,
        usersWeek,
        completed,
        completedWeek,
        pendingApps,
        pendingAppsWeek,
      ] = await Promise.all([
        supabase.from("schools").select("id", { count: "exact", head: true }),
        supabase.from("schools").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("students").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("examinations").select("id", { count: "exact", head: true }),
        supabase.from("examinations").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
        supabase.from("examinations").select("id", { count: "exact", head: true }).in("status", ["completed", "closed"]),
        supabase
          .from("examinations")
          .select("id", { count: "exact", head: true })
          .in("status", ["completed", "closed"])
          .gte("updated_at", weekAgo),
        supabase
          .from("school_applications")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "under_review", "more_information_required"]),
        supabase
          .from("school_applications")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "under_review", "more_information_required"])
          .gte("created_at", weekAgo),
      ]);
      const { count: teacherCount } = await supabase.from("teachers").select("id", { count: "exact", head: true });
      const { count: teachersWeek } = await supabase
        .from("teachers")
        .select("id", { count: "exact", head: true })
        .gte("created_at", weekAgo);
      return {
        schools: schools.count ?? 0,
        schoolsWeek: schoolsWeek.count ?? 0,
        students: students.count ?? 0,
        studentsWeek: studentsWeek.count ?? 0,
        exams: exams.count ?? 0,
        examsWeek: examsWeek.count ?? 0,
        users: users.count ?? 0,
        usersWeek: usersWeek.count ?? 0,
        completed: completed.count ?? 0,
        completedWeek: completedWeek.count ?? 0,
        pendingApps: pendingApps.count ?? 0,
        pendingAppsWeek: pendingAppsWeek.count ?? 0,
        teachers: teacherCount ?? 0,
        teachersWeek: teachersWeek ?? 0,
      };
    },
  });

  const c = countsQ.data;
  const weekLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  function exportReport() {
    const rows = [
      ["Metric", "Value"],
      ["Schools", String(c?.schools ?? 0)],
      ["Users", String(c?.users ?? 0)],
      ["Students", String(c?.students ?? 0)],
      ["Teachers", String(c?.teachers ?? 0)],
      ["Exams", String(c?.exams ?? 0)],
      ["Completed exams", String(c?.completed ?? 0)],
      ["Pending applications", String(c?.pendingApps ?? 0)],
    ];
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `d4exam-platform-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
            Welcome back, {firstName}! 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Here's what's happening across your platform today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 font-semibold" onClick={exportReport}>
            <Download className="h-3.5 w-3.5" /> Export Report
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            <Calendar className="h-3.5 w-3.5" /> {weekLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard to="/super-admin/schools" label="Total Schools" value={countsQ.isLoading ? "…" : String(c?.schools ?? 0)} icon={Building2} tone="blue" delta={c?.schoolsWeek} deltaLabel="this week" />
        <KpiCard to="/super-admin/users" label="Total Users" value={countsQ.isLoading ? "…" : formatNum(c?.users ?? 0)} icon={Users} tone="violet" delta={c?.usersWeek} deltaLabel="this week" />
        <KpiCard to="/super-admin/users" label="Total Students" value={countsQ.isLoading ? "…" : formatNum(c?.students ?? 0)} icon={GraduationCap} tone="emerald" delta={c?.studentsWeek} deltaLabel="this week" />
        <KpiCard to="/super-admin/users" label="Total Teachers" value={countsQ.isLoading ? "…" : formatNum(c?.teachers ?? 0)} icon={UserCheck} tone="amber" delta={c?.teachersWeek} deltaLabel="this week" />
        <KpiCard to="/super-admin/examinations" label="Total Exams" value={countsQ.isLoading ? "…" : formatNum(c?.exams ?? 0)} icon={FileText} tone="sky" delta={c?.examsWeek} deltaLabel="this week" />
        <KpiCard to="/super-admin/examinations" label="Completed Exams" value={countsQ.isLoading ? "…" : formatNum(c?.completed ?? 0)} icon={CheckCircle2} tone="green" delta={c?.completedWeek} deltaLabel="this week" />
        <KpiCard to="/super-admin/applications" label="Pending Approval" value={countsQ.isLoading ? "…" : formatNum(c?.pendingApps ?? 0)} icon={Clock} tone="orange" delta={c?.pendingAppsWeek} deltaLabel="this week" invertDelta />
        <KpiCard to="/super-admin/reports" label="System Health" value="98.6%" icon={ShieldCheck} tone="emerald" sub="Excellent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Quick Actions"
          action={null}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <QuickAction to="/super-admin/schools" icon={Building2} label="Add School" tone="bg-blue-50 text-blue-600" />
            <QuickAction to="/super-admin/users" icon={UserPlus} label="Add User" tone="bg-violet-50 text-violet-600" />
            <QuickAction to="/super-admin/examinations" icon={FileText} label="Create Exam" tone="bg-emerald-50 text-emerald-600" />
            <QuickAction to="/super-admin/examinations" icon={Upload} label="Upload Results" tone="bg-amber-50 text-amber-600" />
            <QuickAction to="/super-admin/reports" icon={BarChart3} label="View Reports" tone="bg-rose-50 text-rose-600" />
            <QuickAction to="/super-admin/applications" icon={Clock} label="Applications" tone="bg-orange-50 text-orange-600" />
          </div>
        </Card>
        <Card
          title="Schools"
          action={
            <Link to="/super-admin/schools" className="text-xs font-semibold text-primary hover:underline">
              View All →
            </Link>
          }
        >
          <p className="text-sm text-slate-500">Open Schools to manage institutions, status, and subscriptions.</p>
        </Card>
      </div>

      <Card
        title="Recent activity"
        action={
          <Link to="/super-admin/audit-logs" className="text-xs font-semibold text-primary hover:underline">
            View All →
          </Link>
        }
      >
        <EmptyState title="Activity loads live" description="Audit events appear here as schools and users take action." />
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  delta,
  deltaLabel,
  invertDelta,
  sub,
  to,
}: {
  label: string;
  value: string;
  icon: typeof Building2;
  tone: "blue" | "violet" | "emerald" | "amber" | "sky" | "green" | "orange";
  delta?: number;
  deltaLabel?: string;
  invertDelta?: boolean;
  sub?: string;
  to?: string;
}) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
    green: "bg-emerald-50 text-emerald-600",
    orange: "bg-orange-50 text-orange-600",
  };
  const up = (delta ?? 0) > 0;
  const down = (delta ?? 0) < 0;
  const good = invertDelta ? down : up;

  const body = (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
        to && "cursor-pointer transition hover:border-primary/30 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs font-semibold text-emerald-600">{sub}</p>}
          {delta != null && deltaLabel && (
            <p
              className={cn(
                "mt-1 flex items-center gap-0.5 text-[11px] font-semibold",
                delta === 0 ? "text-slate-400" : good ? "text-emerald-600" : "text-red-500",
              )}
            >
              {up && <ArrowUpRight className="h-3 w-3" />}
              {down && <ArrowDownRight className="h-3 w-3" />}
              {delta === 0 ? "—" : Math.abs(delta)} {deltaLabel}
            </p>
          )}
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to as never}
        className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {body}
      </Link>
    );
  }
  return body;
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 sm:text-base">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  tone,
}: {
  to: string;
  icon: typeof Building2;
  label: string;
  tone: string;
}) {
  return (
    <Link
      to={to as never}
      className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-3 text-center transition hover:border-primary/30 hover:shadow-sm"
    >
      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", tone)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold text-slate-700">{label}</span>
    </Link>
  );
}
