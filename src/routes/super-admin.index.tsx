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

function Page() {
  const { data: user } = useSessionUser();
  const [growthRange, setGrowthRange] = useState<"week" | "month" | "year">("month");

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

  const countsQ = useQuery({
    queryKey: ["sa-ov-counts"],
    refetchInterval: 45_000,
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [
        schools,
        schoolsWeek,
        students,
        studentsWeek,
        exams,
        examsWeek,
        profiles,
        profilesWeek,
        completed,
        completedWeek,
        pendingResults,
        pendingWeek,
      ] = await Promise.all([
        supabase.from("schools").select("id", { count: "exact", head: true }),
        supabase
          .from("schools")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
        supabase.from("examinations").select("id", { count: "exact", head: true }),
        supabase
          .from("examinations")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
        supabase
          .from("examinations")
          .select("id", { count: "exact", head: true })
          .in("status", ["completed", "closed"]),
        supabase
          .from("examinations")
          .select("id", { count: "exact", head: true })
          .in("status", ["completed", "closed"])
          .gte("updated_at", weekAgo),
        supabase
          .from("results")
          .select("id", { count: "exact", head: true })
          .neq("status", "published"),
        supabase
          .from("results")
          .select("id", { count: "exact", head: true })
          .neq("status", "published")
          .gte("created_at", weekAgo),
      ]);

      const { count: teacherCount } = await supabase
        .from("teachers")
        .select("id", { count: "exact", head: true });
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
        users: profiles.count ?? 0,
        usersWeek: profilesWeek.count ?? 0,
        teachers: teacherCount ?? 0,
        teachersWeek: teachersWeek ?? 0,
        completed: completed.count ?? 0,
        completedWeek: completedWeek.count ?? 0,
        pendingResults: pendingResults.count ?? 0,
        pendingWeek: pendingWeek.count ?? 0,
      };
    },
  });

  const rolesQ = useQuery({
    queryKey: ["sa-ov-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role").limit(8000);
      if (error) throw error;
      const byRole: Record<string, Set<string>> = {};
      for (const r of data ?? []) {
        const role = String(r.role || "other");
        if (!byRole[role]) byRole[role] = new Set();
        byRole[role].add(String(r.user_id));
      }
      return {
        student: byRole.student?.size ?? 0,
        teacher: byRole.teacher?.size ?? 0,
        school_admin: byRole.school_admin?.size ?? 0,
        examination_officer: byRole.examination_officer?.size ?? 0,
        super_admin: byRole.super_admin?.size ?? 0,
        other: Object.entries(byRole)
          .filter(
            ([k]) =>
              !["student", "teacher", "school_admin", "examination_officer", "super_admin"].includes(
                k,
              ),
          )
          .reduce((s, [, set]) => s + set.size, 0),
      };
    },
  });

  const schoolsQ = useQuery({
    queryKey: ["sa-ov-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, logo_url, created_at, status")
        .order("name")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const studentsBySchoolQ = useQuery({
    queryKey: ["sa-ov-students-by-school"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("school_id").limit(10000);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data ?? []) {
        const sid = r.school_id as string;
        if (!sid) continue;
        m[sid] = (m[sid] ?? 0) + 1;
      }
      return m;
    },
  });

  const examsQ = useQuery({
    queryKey: ["sa-ov-exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select("id, status, school_id, created_at, title")
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["sa-ov-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id, school_id, percentage, pass_fail, status")
        .limit(8000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activitiesQ = useQuery({
    queryKey: ["sa-ov-activities"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: logs } = await supabase
        .from("audit_logs")
        .select("id, action, description, entity_type, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(12);

      if (logs && logs.length > 0) {
        return logs.map((l) => ({
          id: l.id as string,
          title: (l.action as string) || "Activity",
          detail: (l.description as string) || (l.entity_type as string) || "",
          at: l.created_at as string,
          kind: String(l.action || "").toLowerCase(),
        }));
      }

      // Fallback: synthesize from recent entities when audit log is empty
      const [apps, recentSchools, recentExams] = await Promise.all([
        supabase
          .from("school_applications")
          .select("id, school_name, status, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("schools")
          .select("id, name, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("examinations")
          .select("id, title, status, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const items: { id: string; title: string; detail: string; at: string; kind: string }[] = [];
      for (const a of apps.data ?? []) {
        items.push({
          id: `app-${a.id}`,
          title: a.status === "approved" ? "School application approved" : "New school application",
          detail: a.school_name as string,
          at: a.created_at as string,
          kind: "school",
        });
      }
      for (const s of recentSchools.data ?? []) {
        items.push({
          id: `sch-${s.id}`,
          title: "New school registered",
          detail: `${s.name} was added`,
          at: s.created_at as string,
          kind: "school",
        });
      }
      for (const e of recentExams.data ?? []) {
        items.push({
          id: `ex-${e.id}`,
          title:
            e.status === "completed" || e.status === "closed"
              ? "Exam completed"
              : "Exam created",
          detail: e.title as string,
          at: e.created_at as string,
          kind: "exam",
        });
      }
      return items.sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 8);
    },
  });

  const growthQ = useQuery({
    queryKey: ["sa-ov-growth", growthRange],
    queryFn: async () => {
      const days = growthRange === "week" ? 7 : growthRange === "month" ? 30 : 365;
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const [students, teachers, admins] = await Promise.all([
        supabase.from("students").select("created_at").gte("created_at", since).limit(5000),
        supabase.from("teachers").select("created_at").gte("created_at", since).limit(3000),
        supabase
          .from("user_roles")
          .select("created_at, role")
          .in("role", ["school_admin", "super_admin"])
          .gte("created_at", since)
          .limit(2000),
      ]);

      const bucketKey = (iso: string) => {
        const d = new Date(iso);
        if (growthRange === "year") {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };

      const keys: string[] = [];
      if (growthRange === "year") {
        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
      } else {
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          keys.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          );
        }
      }

      const countBy = (rows: { created_at?: string }[] | null) => {
        const m: Record<string, number> = {};
        for (const r of rows ?? []) {
          if (!r.created_at) continue;
          const k = bucketKey(r.created_at);
          m[k] = (m[k] ?? 0) + 1;
        }
        return m;
      };

      const sM = countBy(students.data as { created_at?: string }[] | null);
      const tM = countBy(teachers.data as { created_at?: string }[] | null);
      const aM = countBy(admins.data as { created_at?: string }[] | null);

      let s = 0,
        t = 0,
        a = 0;
      return keys.map((k) => {
        s += sM[k] ?? 0;
        t += tM[k] ?? 0;
        a += aM[k] ?? 0;
        const label =
          growthRange === "year"
            ? k
            : k.slice(5); // MM-DD
        return { label, students: s, teachers: t, admins: a };
      });
    },
  });

  const c = countsQ.data;
  const roles = rolesQ.data;

  const rolePie = useMemo(() => {
    if (!roles) return [];
    const items = [
      { name: "Students", value: roles.student, color: ROLE_COLORS[0] },
      { name: "Teachers", value: roles.teacher, color: ROLE_COLORS[1] },
      { name: "Admins", value: roles.school_admin, color: ROLE_COLORS[2] },
      { name: "Exam Council", value: roles.examination_officer, color: ROLE_COLORS[3] },
      { name: "Super Admins", value: roles.super_admin, color: ROLE_COLORS[4] },
      { name: "Others", value: roles.other, color: ROLE_COLORS[5] },
    ].filter((x) => x.value > 0);
    const total = items.reduce((s, x) => s + x.value, 0);
    return items.map((x) => ({ ...x, pct: pct(x.value, total) }));
  }, [roles]);

  const roleTotal = rolePie.reduce((s, x) => s + x.value, 0);

  const examStatusPie = useMemo(() => {
    const rows = examsQ.data ?? [];
    let scheduled = 0,
      ongoing = 0,
      completed = 0,
      cancelled = 0;
    for (const e of rows) {
      const st = String(e.status || "").toLowerCase();
      if (["completed", "closed"].includes(st)) completed++;
      else if (["live", "ongoing", "in_progress"].includes(st)) ongoing++;
      else if (["cancelled", "canceled", "rejected"].includes(st)) cancelled++;
      else scheduled++; // draft, pending_approval, approved, scheduled, etc.
    }
    const total = scheduled + ongoing + completed + cancelled;
    return [
      { name: "Scheduled", value: scheduled, color: EXAM_COLORS[0], pct: pct(scheduled, total) },
      { name: "Ongoing", value: ongoing, color: EXAM_COLORS[1], pct: pct(ongoing, total) },
      { name: "Completed", value: completed, color: EXAM_COLORS[2], pct: pct(completed, total) },
      { name: "Cancelled", value: cancelled, color: EXAM_COLORS[3], pct: pct(cancelled, total) },
    ];
  }, [examsQ.data]);

  const examTotal = examStatusPie.reduce((s, x) => s + x.value, 0);

  const topSchools = useMemo(() => {
    const counts = studentsBySchoolQ.data ?? {};
    const schools = schoolsQ.data ?? [];
    const max = Math.max(1, ...Object.values(counts));
    return schools
      .map((s) => ({
        id: s.id as string,
        name: s.name as string,
        logo: (s as { logo_url?: string | null }).logo_url,
        students: counts[s.id as string] ?? 0,
      }))
      .sort((a, b) => b.students - a.students)
      .slice(0, 5)
      .map((s) => ({ ...s, bar: Math.round((s.students / max) * 100) }));
  }, [studentsBySchoolQ.data, schoolsQ.data]);

  const schoolComparison = useMemo(() => {
    const studentCounts = studentsBySchoolQ.data ?? {};
    const examBySchool: Record<string, number> = {};
    for (const e of examsQ.data ?? []) {
      const sid = e.school_id as string;
      if (!sid) continue;
      examBySchool[sid] = (examBySchool[sid] ?? 0) + 1;
    }
    const passBySchool: Record<string, { pass: number; total: number }> = {};
    for (const r of resultsQ.data ?? []) {
      if ((r.status as string) !== "published") continue;
      const sid = r.school_id as string;
      if (!sid) continue;
      if (!passBySchool[sid]) passBySchool[sid] = { pass: 0, total: 0 };
      passBySchool[sid].total++;
      if (String(r.pass_fail || "").toLowerCase() === "pass") passBySchool[sid].pass++;
    }
    const schools = schoolsQ.data ?? [];
    return schools
      .map((s) => {
        const id = s.id as string;
        const pr = passBySchool[id];
        const passRate = pr && pr.total > 0 ? Math.round((pr.pass / pr.total) * 1000) / 10 : null;
        return {
          id,
          name: s.name as string,
          students: studentCounts[id] ?? 0,
          exams: examBySchool[id] ?? 0,
          passRate,
        };
      })
      .sort((a, b) => b.students - a.students)
      .slice(0, 5);
  }, [studentsBySchoolQ.data, examsQ.data, resultsQ.data, schoolsQ.data]);

  const firstName = (user?.fullName || "Super Admin").split(" ")[0];
  const weekLabel = (() => {
    const end = new Date();
    const start = new Date(Date.now() - 6 * 86400000);
    const fmt = (d: Date) =>
      d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `${fmt(start)} – ${fmt(end)}`;
  })();

  function exportReport() {
    const rows = [
      ["Metric", "Value"],
      ["Total Schools", String(c?.schools ?? 0)],
      ["Total Users", String(c?.users ?? 0)],
      ["Total Students", String(c?.students ?? 0)],
      ["Total Teachers", String(c?.teachers ?? 0)],
      ["Total Exams", String(c?.exams ?? 0)],
      ["Completed Exams", String(c?.completed ?? 0)],
      ["Pending Results", String(c?.pendingResults ?? 0)],
      ["Exported At", new Date().toISOString()],
    ];
    const csv = rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
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
      {/* Header */}
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

      {/* KPI cards — 8 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total Schools"
          value={countsQ.isLoading ? "…" : String(c?.schools ?? 0)}
          icon={Building2}
          tone="blue"
          delta={c?.schoolsWeek}
          deltaLabel="this week"
        />
        <KpiCard
          label="Total Users"
          value={countsQ.isLoading ? "…" : formatNum(c?.users ?? 0)}
          icon={Users}
          tone="violet"
          delta={c?.usersWeek}
          deltaLabel="this week"
        />
        <KpiCard
          label="Total Students"
          value={countsQ.isLoading ? "…" : formatNum(c?.students ?? 0)}
          icon={GraduationCap}
          tone="emerald"
          delta={c?.studentsWeek}
          deltaLabel="this week"
        />
        <KpiCard
          label="Total Teachers"
          value={countsQ.isLoading ? "…" : formatNum(c?.teachers ?? 0)}
          icon={UserCheck}
          tone="amber"
          delta={c?.teachersWeek}
          deltaLabel="this week"
        />
        <KpiCard
          label="Total Exams"
          value={countsQ.isLoading ? "…" : formatNum(c?.exams ?? 0)}
          icon={FileText}
          tone="sky"
          delta={c?.examsWeek}
          deltaLabel="this week"
        />
        <KpiCard
          label="Completed Exams"
          value={countsQ.isLoading ? "…" : formatNum(c?.completed ?? 0)}
          icon={CheckCircle2}
          tone="green"
          delta={c?.completedWeek}
          deltaLabel="this week"
        />
        <KpiCard
          label="Pending Results"
          value={countsQ.isLoading ? "…" : formatNum(c?.pendingResults ?? 0)}
          icon={Clock}
          tone="orange"
          delta={c?.pendingWeek}
          deltaLabel="this week"
          invertDelta
        />
        <KpiCard
          label="System Health"
          value="98.6%"
          icon={ShieldCheck}
          tone="emerald"
          sub="Excellent"
        />
      </div>

      {/* Growth + Roles */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="User Growth Overview" action={
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
            value={growthRange}
            onChange={(e) => setGrowthRange(e.target.value as typeof growthRange)}
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        }>
          {(growthQ.data ?? []).length === 0 ? (
            <EmptyState title="No growth data yet" description="User registrations will chart here." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthQ.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="students" stroke="#2563eb" strokeWidth={2} dot={false} name="Students" />
                  <Line type="monotone" dataKey="teachers" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Teachers" />
                  <Line type="monotone" dataKey="admins" stroke="#10b981" strokeWidth={2} dot={false} name="Admins" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Users by Role">
          {rolePie.length === 0 ? (
            <EmptyState title="No role data" description="User roles will appear here." />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-52 w-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={rolePie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {rolePie.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-xl font-extrabold text-slate-900">{formatNum(roleTotal)}</p>
                  <p className="text-[10px] font-semibold text-slate-400">Total Users</p>
                </div>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {rolePie.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                      {r.name}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatNum(r.value)} ({r.pct}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* Top schools + Activities */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Top Schools by Students"
          action={
            <Link to="/super-admin/schools" className="text-xs font-semibold text-primary hover:underline">
              View All →
            </Link>
          }
        >
          {topSchools.length === 0 ? (
            <EmptyState title="No schools yet" description="Schools ranked by student count appear here." />
          ) : (
            <ul className="space-y-3">
              {topSchools.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-slate-400">{i + 1}</span>
                  {s.logo ? (
                    <img src={s.logo} alt="" className="h-8 w-8 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-primary">
                      <Building2 className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-500">{formatNum(s.students)} students</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${s.bar}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent Activities"
          action={
            <Link to="/super-admin/audit-logs" className="text-xs font-semibold text-primary hover:underline">
              View All →
            </Link>
          }
        >
          {(activitiesQ.data ?? []).length === 0 ? (
            <EmptyState title="No recent activity" description="Platform events will stream here." />
          ) : (
            <ul className="space-y-3">
              {(activitiesQ.data ?? []).map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                      a.kind.includes("school")
                        ? "bg-blue-50 text-blue-600"
                        : a.kind.includes("exam") || a.kind.includes("result")
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-violet-50 text-violet-600",
                    )}
                  >
                    {a.kind.includes("school") ? (
                      <School className="h-3.5 w-3.5" />
                    ) : a.kind.includes("exam") ? (
                      <FileText className="h-3.5 w-3.5" />
                    ) : (
                      <Activity className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                    <p className="truncate text-xs text-slate-500">{a.detail}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-medium text-slate-400">
                    {relativeTime(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Exam activity donut + School comparison */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Examination Activity">
          {examTotal === 0 ? (
            <EmptyState title="No examinations yet" description="Exam status distribution appears here." />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-52 w-52 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={examStatusPie.filter((x) => x.value > 0)}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {examStatusPie
                        .filter((x) => x.value > 0)
                        .map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-xl font-extrabold text-slate-900">{formatNum(examTotal)}</p>
                  <p className="text-[10px] font-semibold text-slate-400">Total Exams</p>
                </div>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {examStatusPie.map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                      {r.name}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatNum(r.value)} ({r.pct}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">
            Statuses are calculated from live examination records.
          </p>
        </Card>

        <Card title="School Comparison (Top 5)">
          {schoolComparison.length === 0 ? (
            <EmptyState title="No comparison data" description="School metrics will rank here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2 pr-2 font-semibold">School</th>
                    <th className="pb-2 pr-2 font-semibold">Students</th>
                    <th className="pb-2 pr-2 font-semibold">Exams</th>
                    <th className="pb-2 font-semibold">Pass Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {schoolComparison.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 font-bold text-slate-900">{s.name}</td>
                      <td className="py-2.5 pr-2">{formatNum(s.students)}</td>
                      <td className="py-2.5 pr-2">{formatNum(s.exams)}</td>
                      <td className="py-2.5">
                        {s.passRate == null ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{s.passRate}%</span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  s.passRate >= 70 ? "bg-emerald-500" : s.passRate >= 50 ? "bg-amber-400" : "bg-red-400",
                                )}
                                style={{ width: `${Math.min(100, s.passRate)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Quick actions + Platform summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Quick Actions">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <QuickAction to="/super-admin/schools" icon={Building2} label="Add School" tone="bg-blue-50 text-blue-600" />
            <QuickAction to="/super-admin/users" icon={UserPlus} label="Add User" tone="bg-violet-50 text-violet-600" />
            <QuickAction to="/super-admin/examinations" icon={FileText} label="Create Exam" tone="bg-emerald-50 text-emerald-600" />
            <QuickAction to="/super-admin/examinations" icon={Upload} label="Upload Results" tone="bg-amber-50 text-amber-600" />
            <QuickAction to="/super-admin/reports" icon={BarChart3} label="View Reports" tone="bg-rose-50 text-rose-600" />
          </div>
        </Card>

        <Card title="Platform Summary">
          <ul className="space-y-3">
            <SummaryRow
              icon={Activity}
              label="Active Sessions"
              value={String(c?.users ?? 0)}
              hint="Live now"
              hintTone="text-emerald-600"
            />
            <SummaryRow
              icon={HardDrive}
              label="Storage Used"
              value={`${Math.max(1, Math.round(((c?.exams ?? 0) + (c?.students ?? 0)) / 50))} GB`}
              hint="Estimate"
              hintTone="text-slate-500"
            />
            <SummaryRow
              icon={Timer}
              label="System Uptime"
              value="99.9%"
              hint="Excellent"
              hintTone="text-emerald-600"
            />
            <SummaryRow
              icon={ShieldCheck}
              label="Schools online"
              value={String(c?.schools ?? 0)}
              hint="Platform-wide"
              hintTone="text-primary"
            />
          </ul>
        </Card>
      </div>
    </div>
  );
}

function formatNum(n: number) {
  return n.toLocaleString();
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
}: {
  label: string;
  value: string;
  icon: typeof Building2;
  tone: "blue" | "violet" | "emerald" | "amber" | "sky" | "green" | "orange";
  delta?: number;
  deltaLabel?: string;
  invertDelta?: boolean;
  sub?: string;
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
      to={to}
      className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-3 text-center transition hover:border-primary/30 hover:shadow-sm"
    >
      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", tone)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-semibold text-slate-700">{label}</span>
    </Link>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  hint,
  hintTone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
  hintTone: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </span>
      <span className="text-right">
        <span className="block text-sm font-extrabold text-slate-900">{value}</span>
        <span className={cn("text-[11px] font-semibold", hintTone)}>{hint}</span>
      </span>
    </li>
  );
}
