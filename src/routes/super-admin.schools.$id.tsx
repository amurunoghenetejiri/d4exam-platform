import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  ChevronRight,
  Loader2,
  UserCheck,
  Activity,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/super-admin/schools/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
    faculty: typeof s.faculty === "string" ? s.faculty : undefined,
    department: typeof s.department === "string" ? s.department : undefined,
    level: typeof s.level === "string" ? s.level : undefined,
  }),
  head: () => ({ meta: [{ title: "School Overview — D4EXAM" }] }),
  component: Page,
});

type Tab =
  | "overview"
  | "users"
  | "faculties"
  | "departments"
  | "students"
  | "teachers"
  | "exams"
  | "results"
  | "activity";

function Page() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const tab = (search.tab as Tab) || "overview";
  const facultyId = search.faculty ?? null;
  const departmentId = search.department ?? null;
  const levelId = search.level ?? null;

  function setTab(next: Tab) {
    void navigate({
      to: "/super-admin/schools/$id",
      params: { id },
      search: { tab: next === "overview" ? undefined : next },
    });
  }

  function goStructure(next: {
    tab?: Tab;
    faculty?: string;
    department?: string;
    level?: string;
  }) {
    void navigate({
      to: "/super-admin/schools/$id",
      params: { id },
      search: {
        tab: next.tab ?? "faculties",
        faculty: next.faculty,
        department: next.department,
        level: next.level,
      },
    });
  }

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
      const [users, faculties, departments, students, exams, results, profilesRoles] =
        await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", id),
          supabase.from("faculties").select("id", { count: "exact", head: true }).eq("school_id", id),
          supabase.from("departments").select("id", { count: "exact", head: true }).eq("school_id", id),
          supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", id),
          supabase.from("examinations").select("id", { count: "exact", head: true }).eq("school_id", id),
          supabase.from("results").select("id", { count: "exact", head: true }).eq("school_id", id),
          supabase.from("profiles").select("id").eq("school_id", id).limit(2000),
        ]);

      let teachers = 0;
      const profileIds = (profilesRoles.data ?? []).map((p) => p.id as string);
      if (profileIds.length) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", profileIds)
          .eq("role", "teacher");
        teachers = new Set((roles ?? []).map((r) => r.user_id as string)).size;
      }

      return {
        users: users.count ?? 0,
        faculties: faculties.count ?? 0,
        departments: departments.count ?? 0,
        students: students.count ?? 0,
        teachers,
        exams: exams.count ?? 0,
        results: results.count ?? 0,
      };
    },
  });

  const structureCountsQ = useQuery({
    queryKey: ["sa-school-struct-counts", id],
    enabled: Boolean(id) && (tab === "overview" || tab === "faculties" || tab === "departments"),
    queryFn: async () => {
      const [depts, students] = await Promise.all([
        supabase.from("departments").select("id, faculty_id").eq("school_id", id),
        supabase.from("students").select("id, faculty_id, department_id, level_id").eq("school_id", id),
      ]);
      const deptByFaculty: Record<string, number> = {};
      for (const d of depts.data ?? []) {
        const fid = (d as { faculty_id?: string | null }).faculty_id;
        if (!fid) continue;
        deptByFaculty[fid] = (deptByFaculty[fid] ?? 0) + 1;
      }
      const studentsByFaculty: Record<string, number> = {};
      const studentsByDept: Record<string, number> = {};
      const studentsByLevel: Record<string, number> = {};
      for (const s of students.data ?? []) {
        const row = s as {
          faculty_id?: string | null;
          department_id?: string | null;
          level_id?: string | null;
        };
        if (row.faculty_id)
          studentsByFaculty[row.faculty_id] = (studentsByFaculty[row.faculty_id] ?? 0) + 1;
        if (row.department_id)
          studentsByDept[row.department_id] = (studentsByDept[row.department_id] ?? 0) + 1;
        if (row.level_id)
          studentsByLevel[row.level_id] = (studentsByLevel[row.level_id] ?? 0) + 1;
      }
      return { deptByFaculty, studentsByFaculty, studentsByDept, studentsByLevel };
    },
  });
  const sc = structureCountsQ.data;

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
      const deptIds = [
        ...new Set(
          (profiles ?? [])
            .map((p) => (p as { department_id?: string | null }).department_id)
            .filter(Boolean) as string[],
        ),
      ];
      const levelIds = [
        ...new Set(
          (profiles ?? [])
            .map((p) => (p as { level_id?: string | null }).level_id)
            .filter(Boolean) as string[],
        ),
      ];
      const deptName: Record<string, string> = {};
      const levelName: Record<string, string> = {};
      if (deptIds.length) {
        const { data: ds } = await supabase.from("departments").select("id, name").in("id", deptIds);
        for (const d of ds ?? []) deptName[d.id as string] = d.name as string;
      }
      if (levelIds.length) {
        const { data: ls } = await supabase.from("levels").select("id, name").in("id", levelIds);
        for (const l of ls ?? []) levelName[l.id as string] = l.name as string;
      }
      return (profiles ?? []).map((p) => ({
        id: p.id as string,
        name: (p.full_name as string) || "—",
        email: (p.email as string) || "—",
        status: (p.status as string) || "—",
        created_at: p.created_at as string | null,
        roles: roleByUser[p.id as string] ?? [],
        department: deptName[(p as { department_id?: string | null }).department_id ?? ""] ?? "—",
        level: levelName[(p as { level_id?: string | null }).level_id ?? ""] ?? "—",
      }));
    },
  });

  const teachersQ = useQuery({
    queryKey: ["sa-school-teachers", id],
    enabled: Boolean(id) && tab === "teachers",
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, status, created_at, department_id")
        .eq("school_id", id)
        .order("full_name")
        .limit(500);
      if (error) throw error;
      const ids = (profiles ?? []).map((p) => p.id as string);
      if (!ids.length) return [];
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids)
        .eq("role", "teacher");
      const teacherIds = new Set((roles ?? []).map((r) => r.user_id as string));
      const deptIds = [
        ...new Set(
          (profiles ?? [])
            .filter((p) => teacherIds.has(p.id as string))
            .map((p) => (p as { department_id?: string | null }).department_id)
            .filter(Boolean) as string[],
        ),
      ];
      const deptName: Record<string, string> = {};
      if (deptIds.length) {
        const { data: ds } = await supabase.from("departments").select("id, name").in("id", deptIds);
        for (const d of ds ?? []) deptName[d.id as string] = d.name as string;
      }
      return (profiles ?? [])
        .filter((p) => teacherIds.has(p.id as string))
        .map((p) => ({
          id: p.id as string,
          name: (p.full_name as string) || "—",
          email: (p.email as string) || "—",
          status: (p.status as string) || "—",
          created_at: p.created_at as string | null,
          department: deptName[(p as { department_id?: string | null }).department_id ?? ""] ?? "—",
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
    queryKey: ["sa-school-depts", id, facultyId],
    enabled: Boolean(id) && (tab === "departments" || (tab === "faculties" && Boolean(facultyId))),
    queryFn: async () => {
      let q = supabase
        .from("departments")
        .select("id, name, code, status, faculty_id, faculties(name)")
        .eq("school_id", id)
        .order("name");
      if (facultyId) q = q.eq("faculty_id", facultyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const levelsQ = useQuery({
    queryKey: ["sa-school-levels", id],
    enabled: Boolean(id) && tab === "faculties" && Boolean(departmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("levels")
        .select("id, name, code, status")
        .eq("school_id", id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const studentsQ = useQuery({
    queryKey: ["sa-school-students", id, departmentId, levelId],
    enabled: Boolean(id) && (tab === "students" || (tab === "faculties" && Boolean(levelId))),
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select(
          "id, full_name, matric_number, student_id, status, created_at, departments(name), levels(name)",
        )
        .eq("school_id", id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (departmentId) q = q.eq("department_id", departmentId);
      if (levelId) q = q.eq("level_id", levelId);
      const { data, error } = await q;
      if (error) {
        let q2 = supabase
          .from("students")
          .select("id, matric_number, student_id, status, created_at, departments(name), levels(name)")
          .eq("school_id", id)
          .order("created_at", { ascending: false })
          .limit(500);
        if (departmentId) q2 = q2.eq("department_id", departmentId);
        if (levelId) q2 = q2.eq("level_id", levelId);
        const { data: d2, error: e2 } = await q2;
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
        .select(
          "id, title, status, scheduled_start, course_id, created_by, courses(code, name, department_id, level_id)",
        )
        .eq("school_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const examIds = (data ?? []).map((e) => e.id as string);
      const attemptCount: Record<string, number> = {};
      if (examIds.length) {
        const { data: attempts } = await supabase
          .from("exam_attempts")
          .select("exam_id")
          .in("exam_id", examIds);
        for (const a of attempts ?? []) {
          const eid = (a as { exam_id: string }).exam_id;
          attemptCount[eid] = (attemptCount[eid] ?? 0) + 1;
        }
      }
      const creatorIds = [
        ...new Set(
          (data ?? [])
            .map((e) => (e as { created_by?: string | null }).created_by)
            .filter(Boolean) as string[],
        ),
      ];
      const teacherName: Record<string, string> = {};
      if (creatorIds.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", creatorIds);
        for (const p of ps ?? []) teacherName[p.id as string] = (p.full_name as string) || "—";
      }
      return (data ?? []).map((e) => {
        const course = (e as {
          courses?: {
            code?: string;
            name?: string;
            department_id?: string | null;
            level_id?: string | null;
          } | null;
        }).courses;
        return {
          id: e.id as string,
          title: e.title as string,
          status: e.status as string,
          courseCode: course?.code ?? "—",
          courseName: course?.name ?? "",
          teacher: teacherName[(e as { created_by?: string | null }).created_by ?? ""] ?? "—",
          students: attemptCount[e.id as string] ?? 0,
        };
      });
    },
  });

  const resultsQ = useQuery({
    queryKey: ["sa-school-results", id],
    enabled: Boolean(id) && tab === "results",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, percentage, grade, status, pass_fail, created_at, examinations(title, courses(code, name))",
        )
        .eq("school_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activityQ = useQuery({
    queryKey: ["sa-school-activity", id],
    enabled: Boolean(id) && tab === "activity",
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from("integrity_events")
        .select("id, event_type, severity, description, created_at, student_id, exam_id")
        .eq("school_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!error && events) return events;
      const { data: attempts } = await supabase
        .from("exam_attempts")
        .select("id, status, submitted_at, started_at, exam_id, student_id, tab_switch_count")
        .eq("school_id", id)
        .order("started_at", { ascending: false })
        .limit(50);
      return (attempts ?? []).map((a) => ({
        id: a.id as string,
        event_type: "ATTEMPT",
        severity: "low",
        description: `Attempt ${(a.status as string) || "—"} · tab switches ${a.tab_switch_count ?? 0}`,
        created_at: (a.submitted_at || a.started_at) as string | null,
        student_id: a.student_id as string | null,
        exam_id: a.exam_id as string | null,
      }));
    },
  });

  const school = schoolQ.data;
  const stats = statsQ.data;
  const facultyList = facultiesQ.data ?? [];
  const faculty = facultyList.find((f) => (f.id as string) === facultyId) ?? null;
  const departmentList = departmentsQ.data ?? [];
  const department = departmentList.find((d) => (d.id as string) === departmentId) ?? null;
  const levelList = levelsQ.data ?? [];
  const level = levelList.find((l) => (l.id as string) === levelId) ?? null;

  const tabs: { id: Tab; label: string; count?: number }[] = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "users", label: "Users", count: stats?.users },
      { id: "faculties", label: "Faculties/Colleges", count: stats?.faculties },
      { id: "departments", label: "Departments", count: stats?.departments },
      { id: "students", label: "Students", count: stats?.students },
      { id: "teachers", label: "Teachers", count: stats?.teachers },
      { id: "exams", label: "Exams", count: stats?.exams },
      { id: "results", label: "Results", count: stats?.results },
      { id: "activity", label: "Activity Logs" },
    ],
    [stats],
  );

  const crumbs = useMemo(() => {
    const items: { label: string; onClick?: () => void }[] = [
      { label: "Schools", onClick: () => void navigate({ to: "/super-admin/schools" }) },
    ];
    if (school) items.push({ label: school.name, onClick: () => setTab("overview") });
    if (faculty) {
      items.push({
        label: faculty.name as string,
        onClick: () => goStructure({ tab: "faculties", faculty: faculty.id as string }),
      });
    } else if (tab === "faculties" && !facultyId) {
      items.push({ label: "Faculties/Colleges" });
    }
    if (department) {
      items.push({
        label: department.name as string,
        onClick: () =>
          goStructure({
            tab: "faculties",
            faculty: facultyId ?? undefined,
            department: department.id as string,
          }),
      });
    }
    if (level) {
      items.push({
        label: level.name as string,
        onClick: () =>
          goStructure({
            tab: "faculties",
            faculty: facultyId ?? undefined,
            department: departmentId ?? undefined,
            level: level.id as string,
          }),
      });
    }
    if (levelId) items.push({ label: "Students" });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school, tab, faculty, department, level, facultyId, departmentId, levelId]);

  if (schoolQ.isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading school…
      </div>
    );
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
      <Breadcrumbs items={crumbs} />

      <PageHeader
        title={`${school.name} — School Overview`}
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

      <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="School" value={school.name} bold />
        <Meta label="School Code" value={school.school_code || "—"} />
        <Meta label="Country" value={school.country || "—"} />
        <Meta label="Status" value={school.status} />
      </div>

      <nav className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={Users} label="Total Users" value={stats?.users ?? "…"} />
            <StatCard icon={GraduationCap} label="Total Students" value={stats?.students ?? "…"} />
            <StatCard icon={UserCheck} label="Total Teachers" value={stats?.teachers ?? "…"} />
            <StatCard icon={Building2} label="Faculties / Colleges" value={stats?.faculties ?? "…"} />
            <StatCard icon={Blocks} label="Departments" value={stats?.departments ?? "…"} />
            <StatCard icon={BookOpen} label="Total Exams" value={stats?.exams ?? "…"} />
            <StatCard icon={FileText} label="Total Results" value={stats?.results ?? "…"} />
          </div>

          <SectionCard title="Academic structure">
            {(facultiesQ.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No faculties / colleges yet.</p>
            ) : (
              <ul className="space-y-2">
                {(facultiesQ.data ?? []).map((f) => (
                  <li
                    key={f.id as string}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{f.name as string}</p>
                      <p className="text-xs text-slate-500">
                        {sc?.deptByFaculty[f.id as string] ?? 0} departments ·{" "}
                        {sc?.studentsByFaculty[f.id as string] ?? 0} students
                        {(f.code as string) ? ` · ${f.code as string}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-semibold"
                      onClick={() => goStructure({ tab: "faculties", faculty: f.id as string })}
                    >
                      View <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
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
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Role</th>
                    <th className="py-2 pr-2">Department</th>
                    <th className="py-2 pr-2">Level</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQ.data.map((u) => (
                    <tr key={u.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 font-semibold">{u.name}</td>
                      <td className="py-2.5 pr-2 text-xs">
                        {u.roles.map((r) => r.replaceAll("_", " ")).join(", ") || "—"}
                      </td>
                      <td className="py-2.5 pr-2">{u.department}</td>
                      <td className="py-2.5 pr-2">{u.level}</td>
                      <td className="py-2.5 pr-2">
                        <StatusBadge status={u.status} />
                      </td>
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

      {tab === "teachers" && (
        <SectionCard title={`Teachers (${teachersQ.data?.length ?? 0})`}>
          {teachersQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(teachersQ.data?.length) ? (
            <EmptyState title="No teachers" description="Users with teacher role for this school." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Email</th>
                    <th className="py-2 pr-2">Department</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {teachersQ.data.map((t) => (
                    <tr key={t.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 font-semibold">{t.name}</td>
                      <td className="py-2.5 pr-2">{t.email}</td>
                      <td className="py-2.5 pr-2">{t.department}</td>
                      <td className="py-2.5 pr-2">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="py-2.5 text-xs text-slate-500">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {tab === "faculties" && !facultyId && (
        <SectionCard title="Faculties / Colleges">
          {(facultiesQ.data ?? []).length === 0 ? (
            <EmptyState title="None" description="No faculties for this school." />
          ) : (
            <ul className="space-y-2">
              {(facultiesQ.data ?? []).map((f) => (
                <li
                  key={f.id as string}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-bold">{f.name as string}</p>
                    <p className="text-xs text-slate-500">
                      {sc?.deptByFaculty[f.id as string] ?? 0} departments ·{" "}
                      {sc?.studentsByFaculty[f.id as string] ?? 0} students
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-semibold"
                    onClick={() => goStructure({ tab: "faculties", faculty: f.id as string })}
                  >
                    View <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "faculties" && facultyId && !departmentId && (
        <SectionCard title={`Departments — ${faculty?.name ?? ""}`}>
          {departmentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(departmentsQ.data?.length) ? (
            <EmptyState title="No departments" description="No departments under this faculty." />
          ) : (
            <ul className="space-y-2">
              {departmentsQ.data.map((d) => (
                <li
                  key={d.id as string}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-bold">{d.name as string}</p>
                    <p className="text-xs text-slate-500">
                      {sc?.studentsByDept[d.id as string] ?? 0} students
                      {(d.code as string) ? ` · ${d.code as string}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-semibold"
                    onClick={() =>
                      goStructure({
                        tab: "faculties",
                        faculty: facultyId,
                        department: d.id as string,
                      })
                    }
                  >
                    View <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "faculties" && departmentId && !levelId && (
        <SectionCard title={`Levels — ${department?.name ?? ""}`}>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={GraduationCap}
              label="Total Students"
              value={sc?.studentsByDept[departmentId] ?? 0}
            />
          </div>
          {levelsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(levelsQ.data?.length) ? (
            <EmptyState title="No levels" description="Levels are shared across the school." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {levelsQ.data.map((l) => (
                <button
                  key={l.id as string}
                  type="button"
                  onClick={() =>
                    goStructure({
                      tab: "faculties",
                      faculty: facultyId ?? undefined,
                      department: departmentId,
                      level: l.id as string,
                    })
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-primary/40"
                >
                  <p className="font-bold text-slate-900">{l.name as string}</p>
                  <p className="text-xs text-slate-500">
                    {sc?.studentsByLevel[l.id as string] ?? 0} students · open for this department
                  </p>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {tab === "faculties" && levelId && (
        <SectionCard title={`Students — ${level?.name ?? ""} · ${department?.name ?? ""}`}>
          {studentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(studentsQ.data?.length) ? (
            <EmptyState title="No students" description="No students in this department/level." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">SN</th>
                    <th className="py-2 pr-2">Student Name</th>
                    <th className="py-2 pr-2">Matric Number</th>
                    <th className="py-2 pr-2">Level</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsQ.data.map((s, i) => (
                    <tr key={s.id as string} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 text-slate-500">{i + 1}</td>
                      <td className="py-2.5 pr-2 font-semibold">
                        {(s as { full_name?: string }).full_name || "—"}
                      </td>
                      <td className="py-2.5 pr-2">
                        {(s.matric_number as string) || (s.student_id as string)}
                      </td>
                      <td className="py-2.5 pr-2">
                        {(s as { levels?: { name?: string } | null }).levels?.name ??
                          level?.name ??
                          "—"}
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

      {tab === "departments" && (
        <SectionCard title="Departments">
          {departmentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(departmentsQ.data?.length) ? (
            <EmptyState title="None" description="No departments." />
          ) : (
            <ul className="space-y-2">
              {departmentsQ.data.map((d) => (
                <li
                  key={d.id as string}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-semibold">{d.name as string}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {(d as { faculties?: { name?: string } | null }).faculties?.name ?? ""}
                      {" · "}
                      {sc?.studentsByDept[d.id as string] ?? 0} students
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-semibold"
                    onClick={() =>
                      goStructure({
                        tab: "faculties",
                        faculty: (d as { faculty_id?: string | null }).faculty_id ?? undefined,
                        department: d.id as string,
                      })
                    }
                  >
                    View
                  </Button>
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
                    <th className="py-2 pr-2">SN</th>
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 pr-2">Matric</th>
                    <th className="py-2 pr-2">Department</th>
                    <th className="py-2 pr-2">Level</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsQ.data.map((s, i) => (
                    <tr key={s.id as string} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 text-slate-500">{i + 1}</td>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Exam</th>
                    <th className="py-2 pr-2">Course</th>
                    <th className="py-2 pr-2">Teacher</th>
                    <th className="py-2 pr-2">Students</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {examsQ.data.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 font-semibold">{e.title}</td>
                      <td className="py-2.5 pr-2 text-xs">
                        {e.courseCode}
                        {e.courseName ? ` · ${e.courseName}` : ""}
                      </td>
                      <td className="py-2.5 pr-2">{e.teacher}</td>
                      <td className="py-2.5 pr-2">{e.students}</td>
                      <td className="py-2.5">
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
                <li
                  key={r.id as string}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-semibold">
                      {(r as { examinations?: { title?: string } | null }).examinations?.title ??
                        "Exam"}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {r.percentage != null ? `${r.percentage}%` : "—"}
                      {r.grade ? ` · ${r.grade}` : ""}
                      {r.pass_fail ? ` · ${r.pass_fail}` : ""}
                    </span>
                  </span>
                  <StatusBadge status={r.status as string} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "activity" && (
        <SectionCard title="Activity Logs">
          {activityQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : !(activityQ.data?.length) ? (
            <EmptyState
              title="No activity yet"
              description="Security events and examination attempts for this school appear here."
              icon={Activity}
            />
          ) : (
            <ul className="space-y-2">
              {activityQ.data.map((ev) => (
                <li
                  key={ev.id as string}
                  className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {String(ev.event_type || "EVENT").replaceAll("_", " ")}
                    </span>
                    <span className="text-xs text-slate-500">
                      {ev.created_at ? new Date(ev.created_at as string).toLocaleString() : "—"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {(ev as { description?: string }).description || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      <div className="mt-6">
        <Button variant="outline" className="font-semibold" asChild>
          <Link to="/super-admin/schools">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Schools
          </Link>
        </Button>
      </div>
    </>
  );
}

function Breadcrumbs({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-600">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />}
          {item.onClick ? (
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ) : (
            <span className="font-semibold text-slate-900">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function Meta({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn("truncate text-sm text-slate-900", bold && "font-bold")}>{value}</p>
    </div>
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
