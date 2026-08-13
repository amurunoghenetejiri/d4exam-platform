import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Users,
  Blocks,
  GraduationCap,
  BookOpen,
  FileText,
  ChevronDown,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/super-admin/schools/$id")({
  head: () => ({
    meta: [{ title: "School Overview — D4EXAM" }],
  }),
  component: Page,
});

type Tab = "overview" | "users" | "faculties" | "departments" | "students" | "exams" | "results";

function Page() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [logsOpen, setLogsOpen] = useState(false);

  const schoolQ = useQuery({
    queryKey: ["sa-school", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, school_code, country, subscription_plan, status, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        school_code: string | null;
        country: string | null;
        subscription_plan: string | null;
        status: string;
        created_at: string | null;
      } | null;
    },
  });

  const statsQ = useQuery({
    queryKey: ["sa-school-stats", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [users, faculties, departments, students, exams, results] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", id),
        supabase.from("faculties").select("id", { count: "exact", head: true }).eq("school_id", id),
        supabase.from("departments").select("id", { count: "exact", head: true }).eq("school_id", id),
        supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", id),
        supabase.from("examinations").select("id", { count: "exact", head: true }).eq("school_id", id),
        supabase.from("results").select("id", { count: "exact", head: true }).eq("school_id", id),
      ]);
      return {
        users: users.count ?? 0,
        faculties: faculties.count ?? 0,
        departments: departments.count ?? 0,
        students: students.count ?? 0,
        exams: exams.count ?? 0,
        results: results.count ?? 0,
      };
    },
  });

  const usersQ = useQuery({
    queryKey: ["sa-school-users", id],
    enabled: Boolean(id) && tab === "users",
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, status, created_at")
        .eq("school_id", id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const ids = (profiles ?? []).map((p) => p.id as string);
      let roles: { user_id: string; role: string }[] = [];
      if (ids.length) {
        const { data: r } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
        roles = (r ?? []) as { user_id: string; role: string }[];
      }
      const roleByUser: Record<string, string[]> = {};
      for (const r of roles) {
        if (!roleByUser[r.user_id]) roleByUser[r.user_id] = [];
        roleByUser[r.user_id].push(r.role);
      }

      return (profiles ?? []).map((p) => ({
        id: p.id as string,
        name: (p.full_name as string) || "—",
        email: (p.email as string) || "—",
        status: (p.status as string) || "—",
        created_at: p.created_at as string | null,
        roles: roleByUser[p.id as string] ?? [],
      }));
    },
  });

  const facultiesQ = useQuery({
    queryKey: ["sa-school-faculties", id],
    enabled: Boolean(id) && (tab === "faculties" || tab === "overview"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faculties")
        .select("id, name, code, status")
        .eq("school_id", id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const departmentsQ = useQuery({
    queryKey: ["sa-school-depts", id],
    enabled: Boolean(id) && tab === "departments",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, code, status, faculty_id, faculties(name)")
        .eq("school_id", id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const studentsQ = useQuery({
    queryKey: ["sa-school-students", id],
    enabled: Boolean(id) && tab === "students",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, full_name, matric_number, student_id, status, created_at, departments(name), levels(name)",
        )
        .eq("school_id", id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("students")
          .select("id, matric_number, student_id, status, created_at, departments(name), levels(name)")
          .eq("school_id", id)
          .order("created_at", { ascending: false })
          .limit(500);
        if (e2) throw e2;
        return d2 ?? [];
      }
      return data ?? [];
    },
  });

  const examsQ = useQuery({
    queryKey: ["sa-school-exams", id],
    enabled: Boolean(id) && tab === "exams",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, scheduled_start, courses(code, name)")
        .eq("school_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["sa-school-results", id],
    enabled: Boolean(id) && tab === "results",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select("id, percentage, grade, status, pass_fail, created_at, examinations(title)")
        .eq("school_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const school = schoolQ.data;
  const stats = statsQ.data;

  const tabs: { id: Tab; label: string; count?: number }[] = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "users", label: "Users", count: stats?.users },
      { id: "faculties", label: "Faculties", count: stats?.faculties },
      { id: "departments", label: "Departments", count: stats?.departments },
      { id: "students", label: "Students", count: stats?.students },
      { id: "exams", label: "Exams", count: stats?.exams },
      { id: "results", label: "Results", count: stats?.results },
    ],
    [stats],
  );

  if (schoolQ.isLoading) {
    return <p className="text-sm text-slate-500">Loading school…</p>;
  }

  if (!school) {
    return (
      <div className="text-center">
        <p className="font-bold">School not found</p>
        <Button className="mt-4" asChild>
          <Link to="/super-admin/schools">Back to schools</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3">
        <Button variant="outline" size="sm" className="font-semibold" asChild>
          <Link to="/super-admin/schools">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Schools
          </Link>
        </Button>
      </div>

      <PageHeader
        title={school.name}
        description={
          [
            school.school_code ? `Code ${school.school_code}` : null,
            school.country,
            school.subscription_plan,
          ]
            .filter(Boolean)
            .join(" · ") || "School overview"
        }
        actions={<StatusBadge status={school.status} />}
      />

      <nav className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              tab === t.id
                ? "border-primary bg-primary text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-primary/40",
            )}
          >
            {t.label}
            {typeof t.count === "number" ? ` (${t.count})` : ""}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard icon={Users} label="Users" value={stats?.users ?? "…"} />
            <StatCard icon={Building2} label="Faculties / Colleges" value={stats?.faculties ?? "…"} />
            <StatCard icon={Blocks} label="Departments" value={stats?.departments ?? "…"} />
            <StatCard icon={GraduationCap} label="Students" value={stats?.students ?? "…"} />
            <StatCard icon={BookOpen} label="Examinations" value={stats?.exams ?? "…"} />
            <StatCard icon={FileText} label="Results" value={stats?.results ?? "…"} />
          </div>

          <SectionCard title="Faculties / Colleges">
            {(facultiesQ.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No faculties yet.</p>
            ) : (
              <ul className="space-y-2">
                {(facultiesQ.data ?? []).map((f) => (
                  <li key={f.id as string} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span className="font-semibold">{f.name as string}</span>
                    <span className="text-xs text-slate-500">{(f.code as string) || "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-extrabold text-slate-900"
              onClick={() => setLogsOpen((v) => !v)}
            >
              Security & activity notes
              <ChevronDown className={cn("h-4 w-4 transition", logsOpen && "rotate-180")} />
            </button>
            {logsOpen && (
              <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                <p>Integrity events, tab switches, face and screen-share logs are stored per examination attempt under each school. Open Results or Officer integrity tools for operational review.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "users" && (
        <SectionCard title={`Users (${usersQ.data?.length ?? 0})`}>
          {usersQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(usersQ.data?.length) ? (
            <EmptyState title="No users" description="Profiles linked to this school appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Role</th>
                    <th className="py-2 pr-2">Email</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQ.data.map((u) => (
                    <tr key={u.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 font-semibold">{u.name}</td>
                      <td className="py-2.5 pr-2 text-xs">{u.roles.map((r) => r.replaceAll("_", " ")).join(", ") || "—"}</td>
                      <td className="py-2.5 pr-2">{u.email}</td>
                      <td className="py-2.5 pr-2"><StatusBadge status={u.status} /></td>
                      <td className="py-2.5 text-xs text-slate-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {tab === "faculties" && (
        <SectionCard title="Faculties / Colleges">
          {(facultiesQ.data ?? []).length === 0 ? (
            <EmptyState title="None" description="No faculties for this school." />
          ) : (
            <ul className="space-y-2">
              {(facultiesQ.data ?? []).map((f) => (
                <li key={f.id as string} className="rounded-lg border border-slate-100 px-3 py-2 text-sm font-semibold">
                  {f.name as string}{" "}
                  <span className="text-xs font-normal text-slate-500">{(f.code as string) || ""}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "departments" && (
        <SectionCard title="Departments">
          {departmentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(departmentsQ.data?.length) ? (
            <EmptyState title="None" description="No departments." />
          ) : (
            <ul className="space-y-2">
              {departmentsQ.data.map((d) => (
                <li key={d.id as string} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span className="font-semibold">{d.name as string}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {(d as { faculties?: { name?: string } | null }).faculties?.name ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "students" && (
        <SectionCard title={`Students (${studentsQ.data?.length ?? 0})`}>
          {studentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(studentsQ.data?.length) ? (
            <EmptyState title="No students" description="Student records for this school." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Matric</th>
                    <th className="py-2 pr-2">Department</th>
                    <th className="py-2 pr-2">Level</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsQ.data.map((s) => (
                    <tr key={s.id as string} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 font-semibold">
                        {(s as { full_name?: string }).full_name || "—"}
                      </td>
                      <td className="py-2.5 pr-2">
                        {(s.matric_number as string) || (s.student_id as string)}
                      </td>
                      <td className="py-2.5 pr-2">
                        {(s as { departments?: { name?: string } | null }).departments?.name ?? "—"}
                      </td>
                      <td className="py-2.5 pr-2">
                        {(s as { levels?: { name?: string } | null }).levels?.name ?? "—"}
                      </td>
                      <td className="py-2.5">
                        <StatusBadge status={s.status as string} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {tab === "exams" && (
        <SectionCard title="Examinations">
          {examsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(examsQ.data?.length) ? (
            <EmptyState title="No exams" description="Examinations for this school." />
          ) : (
            <ul className="space-y-2">
              {examsQ.data.map((e) => (
                <li key={e.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">{e.title as string}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {(e as { courses?: { code?: string } | null }).courses?.code ?? ""}
                    </span>
                  </span>
                  <StatusBadge status={e.status as string} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "results" && (
        <SectionCard title="Results">
          {resultsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(resultsQ.data?.length) ? (
            <EmptyState title="No results" description="Published and pending results." />
          ) : (
            <ul className="space-y-2">
              {resultsQ.data.map((r) => (
                <li key={r.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span>
                    <span className="font-semibold">
                      {(r as { examinations?: { title?: string } | null }).examinations?.title ?? "Exam"}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {r.percentage != null ? `${r.percentage}%` : "—"}
                      {r.grade ? ` · ${r.grade}` : ""}
                    </span>
                  </span>
                  <StatusBadge status={r.status as string} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}
