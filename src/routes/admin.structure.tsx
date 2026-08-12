import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Blocks,
  GraduationCap,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Archive,
  Pencil,
  BookOpen,
  Users,
  Layers,
  Upload,
  Ban,
} from "lucide-react";
import { PageHeader, SectionCard, EmptyState, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/structure")({
  validateSearch: (s: Record<string, unknown>) => ({
    faculty: typeof s.faculty === "string" ? s.faculty : undefined,
    department: typeof s.department === "string" ? s.department : undefined,
    level: typeof s.level === "string" ? s.level : undefined,
  }),
  head: () => ({
    meta: [{ title: "Academic Structure — D4EXAM" }],
  }),
  component: Page,
});

type Faculty = { id: string; name: string; code: string | null; status: string };
type Department = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  faculty_id: string | null;
};
type Level = { id: string; name: string; code: string | null; status: string };
type StudentRow = {
  id: string;
  student_id: string;
  matric_number: string | null;
  status: string;
  department_id: string | null;
  faculty_id: string | null;
  level_id: string | null;
  profiles: { full_name: string; email?: string } | null;
};
type Course = {
  id: string;
  code: string;
  name: string;
  department_id: string | null;
  level_id: string | null;
  status: string;
};

function Page() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();

  const facultyId = search.faculty ?? null;
  const departmentId = search.department ?? null;
  const levelId = search.level ?? null;

  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  // Forms
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  // Student form
  const [sFull, setSFull] = useState("");
  const [sMatric, setSMatric] = useState("");
  const [sEmail, setSEmail] = useState("");

  const facultiesQ = useQuery({
    queryKey: ["struct-faculties", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faculties")
        .select("id, name, code, status")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Faculty[];
    },
  });

  const departmentsQ = useQuery({
    queryKey: ["struct-depts", schoolId, facultyId],
    enabled: Boolean(schoolId && facultyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, code, status, faculty_id")
        .eq("school_id", schoolId!)
        .eq("faculty_id", facultyId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });

  const levelsQ = useQuery({
    queryKey: ["struct-levels", schoolId],
    enabled: Boolean(schoolId && departmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("levels")
        .select("id, name, code, status")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Level[];
    },
  });

  const studentsQ = useQuery({
    queryKey: ["struct-students", schoolId, departmentId, levelId],
    enabled: Boolean(schoolId && departmentId && levelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, student_id, matric_number, status, department_id, faculty_id, level_id, profiles(full_name, email)",
        )
        .eq("school_id", schoolId!)
        .eq("department_id", departmentId!)
        .eq("level_id", levelId!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const coursesQ = useQuery({
    queryKey: ["struct-courses", schoolId, departmentId],
    enabled: Boolean(schoolId && departmentId && !levelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, code, name, department_id, level_id, status")
        .eq("school_id", schoolId!)
        .eq("department_id", departmentId!)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Course[];
    },
  });

  const faculties = facultiesQ.data ?? [];
  const departments = departmentsQ.data ?? [];
  const levels = levelsQ.data ?? [];
  const students = studentsQ.data ?? [];
  const courses = coursesQ.data ?? [];

  const faculty = faculties.find((f) => f.id === facultyId) ?? null;
  const department = departments.find((d) => d.id === departmentId) ?? null;
  const level = levels.find((l) => l.id === levelId) ?? null;

  function go(next: { faculty?: string; department?: string; level?: string }) {
    void navigate({
      search: {
        faculty: next.faculty,
        department: next.department,
        level: next.level,
      },
    });
    setQ("");
    setName("");
    setCode("");
    setEditId(null);
  }

  function match(text: string) {
    if (!q.trim()) return true;
    return text.toLowerCase().includes(q.trim().toLowerCase());
  }

  async function archiveRow(
    table: "faculties" | "departments" | "levels" | "students",
    id: string,
  ) {
    if (!schoolId) return;
    try {
      const { error } = await supabase
        .from(table)
        .update({ status: "archived" } as never)
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Archived");
      await qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function suspendStudent(id: string) {
    if (!schoolId) return;
    try {
      const { error } = await supabase
        .from("students")
        .update({ status: "suspended" } as never)
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Student suspended");
      await studentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveFaculty() {
    if (!schoolId || !name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      if (editId) {
        const { error } = await supabase
          .from("faculties")
          .update({ name: name.trim(), code: code.trim() || null } as never)
          .eq("id", editId)
          .eq("school_id", schoolId);
        if (error) throw error;
        toast.success("Faculty / College updated");
      } else {
        const { error } = await supabase.from("faculties").insert({
          school_id: schoolId,
          name: name.trim(),
          code: code.trim() || null,
          status: "active",
        } as never);
        if (error) throw error;
        toast.success("Faculty / College created");
      }
      setName("");
      setCode("");
      setEditId(null);
      await facultiesQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDepartment() {
    if (!schoolId || !facultyId || !name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      if (editId) {
        const { error } = await supabase
          .from("departments")
          .update({ name: name.trim(), code: code.trim() || null } as never)
          .eq("id", editId);
        if (error) throw error;
        toast.success("Department updated");
      } else {
        const { error } = await supabase.from("departments").insert({
          school_id: schoolId,
          faculty_id: facultyId,
          name: name.trim(),
          code: code.trim() || null,
          status: "active",
        } as never);
        if (error) throw error;
        toast.success("Department created");
      }
      setName("");
      setCode("");
      setEditId(null);
      await departmentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLevel() {
    if (!schoolId || !name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      if (editId) {
        const { error } = await supabase
          .from("levels")
          .update({ name: name.trim(), code: code.trim() || null } as never)
          .eq("id", editId);
        if (error) throw error;
        toast.success("Level updated");
      } else {
        const { error } = await supabase.from("levels").insert({
          school_id: schoolId,
          name: name.trim(),
          code: code.trim() || null,
          status: "active",
        } as never);
        if (error) throw error;
        toast.success("Level created");
      }
      setName("");
      setCode("");
      setEditId(null);
      await levelsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function ensureDefaultLevels() {
    if (!schoolId || levels.length > 0) return;
    setBusy(true);
    try {
      const defaults = ["100 Level", "200 Level", "300 Level", "400 Level", "500 Level"];
      const { error } = await supabase.from("levels").insert(
        defaults.map((n, i) => ({
          school_id: schoolId,
          name: n,
          code: String(100 + i * 100),
          status: "active",
        })) as never,
      );
      if (error) throw error;
      toast.success("Default levels added (100–500). Edit or add more as needed.");
      await levelsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addStudent() {
    if (!schoolId || !facultyId || !departmentId || !levelId) return;
    if (!sFull.trim() || !sMatric.trim()) {
      toast.error("Full name and matric number are required");
      return;
    }
    setBusy(true);
    try {
      const matric = sMatric.trim();
      const { data: dup } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .or(`matric_number.eq.${matric},student_id.eq.${matric}`)
        .maybeSingle();
      if (dup) {
        toast.error(`Matric ${matric} already exists — skipped`);
        setBusy(false);
        return;
      }

      const email =
        sEmail.trim().toLowerCase() ||
        `${matric.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}@students.local`;

      // Profile + student row (auth optional — link later via import flow if needed)
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .insert({
          school_id: schoolId,
          full_name: sFull.trim(),
          email,
          status: "active",
          auth_user_id: crypto.randomUUID(), // placeholder if column requires uuid; may fail
        } as never)
        .select("id")
        .single();

      // If profile insert fails (auth_user_id constraint), still try students with null profile
      let profileId = profile?.id as string | undefined;
      if (pErr) {
        console.warn("profile create:", pErr.message);
        profileId = undefined;
      }

      const { error } = await supabase.from("students").insert({
        school_id: schoolId,
        profile_id: profileId ?? null,
        student_id: matric,
        matric_number: matric,
        faculty_id: facultyId,
        department_id: departmentId,
        level_id: levelId,
        status: "active",
      } as never);
      if (error) throw error;

      toast.success("Student added to this level");
      setSFull("");
      setSMatric("");
      setSEmail("");
      await studentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message || "Could not add student");
    } finally {
      setBusy(false);
    }
  }

  function parseStudentCsv(text: string) {
    const lines = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [] as { full: string; matric: string }[];
    const rows: { full: string; matric: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      // SN | Full Name | Matric  OR  Full Name | Matric
      if (cols.length >= 3) {
        rows.push({ full: cols[1], matric: cols[2] });
      } else if (cols.length === 2) {
        rows.push({ full: cols[0], matric: cols[1] });
      }
    }
    return rows.filter((r) => r.full && r.matric);
  }

  async function importStudentsFile(file: File) {
    if (!schoolId || !facultyId || !departmentId || !levelId) return;
    const text = await file.text();
    const rows = parseStudentCsv(text);
    if (!rows.length) {
      toast.error("No valid rows. Use: SN, Student Full Name, Matric Number");
      return;
    }
    setBusy(true);
    let created = 0;
    let skipped = 0;
    try {
      for (const r of rows) {
        const { data: dup } = await supabase
          .from("students")
          .select("id")
          .eq("school_id", schoolId)
          .or(`matric_number.eq.${r.matric},student_id.eq.${r.matric}`)
          .maybeSingle();
        if (dup) {
          skipped++;
          continue;
        }
        const { error } = await supabase.from("students").insert({
          school_id: schoolId,
          student_id: r.matric,
          matric_number: r.matric,
          faculty_id: facultyId,
          department_id: departmentId,
          level_id: levelId,
          status: "active",
        } as never);
        if (!error) created++;
        else skipped++;
      }
      toast.success(`Imported ${created} students${skipped ? `, skipped ${skipped} (duplicates/errors)` : ""}`);
      await studentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCourse() {
    if (!schoolId || !departmentId || !name.trim() || !code.trim()) {
      toast.error("Course code and title required");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("courses").insert({
        school_id: schoolId,
        department_id: departmentId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        status: "active",
      } as never);
      if (error) throw error;
      toast.success("Course created for this department");
      setName("");
      setCode("");
      await coursesQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ——— Breadcrumbs ———
  const crumbs = useMemo(() => {
    const items: { label: string; onClick?: () => void }[] = [
      {
        label: "Academic Structure",
        onClick: () => go({}),
      },
    ];
    if (faculty) {
      items.push({
        label: faculty.name,
        onClick: () => go({ faculty: faculty.id }),
      });
    }
    if (department) {
      items.push({
        label: department.name,
        onClick: () => go({ faculty: facultyId!, department: department.id }),
      });
    }
    if (level) {
      items.push({ label: level.name });
    }
    return items;
  }, [faculty, department, level, facultyId]);

  // ——— Views ———
  // ROOT: faculties only
  if (!facultyId) {
    const list = faculties.filter(
      (f) => f.status !== "archived" && match(`${f.name} ${f.code ?? ""}`),
    );
    return (
      <>
        <PageHeader
          title="Academic Structure"
          description="Faculty / College → Department → Level → Students. One level at a time."
        />
        <Breadcrumbs items={crumbs} />
        <Toolbar search={q} onSearch={setQ} />

        <div className="mt-4 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <SectionCard title={editId ? "Edit Faculty / College" : "Add Faculty / College"}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Faculty of Engineering"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ENG" />
              </div>
              <div className="flex gap-2">
                <Button className="font-semibold" disabled={busy} onClick={() => void saveFaculty()}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editId ? "Update" : "Add Faculty / College"}
                </Button>
                {editId && (
                  <Button variant="outline" onClick={() => { setEditId(null); setName(""); setCode(""); }}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={`Faculty / College (${list.length})`}>
            {facultiesQ.isLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : list.length === 0 ? (
              <EmptyState
                title="No Faculty / College yet"
                description="Add Engineering, Science, Arts, etc."
                icon={Building2}
              />
            ) : (
              <ul className="space-y-2">
                {list.map((f) => (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => go({ faculty: f.id })}
                    >
                      <p className="font-bold text-slate-900">{f.name}</p>
                      <p className="text-xs text-slate-500">{f.code || "No code"} · Click to open departments</p>
                    </button>
                    <div className="flex items-center gap-1">
                      <StatusBadge status={f.status} />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditId(f.id);
                          setName(f.name);
                          setCode(f.code ?? "");
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void archiveRow("faculties", f.id)}>
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => go({ faculty: f.id })}>
                        Open <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </>
    );
  }

  // FACULTY: departments
  if (facultyId && !departmentId) {
    const list = departments.filter(
      (d) => d.status !== "archived" && match(`${d.name} ${d.code ?? ""}`),
    );
    return (
      <>
        <PageHeader
          title={faculty?.name ?? "Departments"}
          description="Departments in this Faculty / College"
        />
        <Breadcrumbs items={crumbs} />
        <Toolbar search={q} onSearch={setQ} />

        <div className="mt-4 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <SectionCard title={editId ? "Edit department" : "Add department"}>
            <div className="space-y-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Computer Engineering"
              />
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CPE" />
              <Button className="font-semibold" disabled={busy} onClick={() => void saveDepartment()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editId ? "Update" : "Add department"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title={`Departments (${list.length})`}>
            {departmentsQ.isLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : list.length === 0 ? (
              <EmptyState
                title="No departments"
                description="Add Computer Engineering, Mechanical, etc."
                icon={Blocks}
              />
            ) : (
              <ul className="space-y-2">
                {list.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => go({ faculty: facultyId, department: d.id })}
                    >
                      <p className="font-bold text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.code || "—"} · Open levels & courses</p>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditId(d.id);
                          setName(d.name);
                          setCode(d.code ?? "");
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void archiveRow("departments", d.id)}>
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => go({ faculty: facultyId, department: d.id })}
                      >
                        Open <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </>
    );
  }

  // DEPARTMENT: levels + courses hub
  if (departmentId && !levelId) {
    const list = levels.filter((l) => l.status !== "archived" && match(`${l.name} ${l.code ?? ""}`));
    return (
      <>
        <PageHeader
          title={department?.name ?? "Department"}
          description="Levels (students) · Courses · Teachers (assign under Courses)"
        />
        <Breadcrumbs items={crumbs} />
        <Toolbar search={q} onSearch={setQ} />

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Levels"
            description="Click a level to manage its students"
            action={
              levels.length === 0 ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void ensureDefaultLevels()}>
                  Seed 100–500
                </Button>
              ) : undefined
            }
          >
            <div className="mb-3 flex gap-2">
              <Input
                placeholder="e.g. 200 Level"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                className="w-24"
                placeholder="200"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void saveLevel()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {levelsQ.isLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : list.length === 0 ? (
              <EmptyState
                title="No levels"
                description="Add 100 Level, 200 Level… or seed defaults."
                icon={Layers}
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() =>
                      go({ faculty: facultyId!, department: departmentId, level: l.id })
                    }
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="font-bold text-slate-900">{l.name}</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Courses in this department" description="Linked for teacher assignment & exams">
            <div className="mb-3 flex gap-2">
              <Input
                placeholder="Code CPE101"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-28"
              />
              <Input
                placeholder="Course title"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void saveCourse()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Assign teachers under <Link className="font-semibold text-primary" to="/admin/courses">Admin → Courses</Link>
            </p>
            {coursesQ.isLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : courses.length === 0 ? (
              <EmptyState title="No courses" description="Add CPE 101, etc. for this department." icon={BookOpen} />
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {courses.map((c) => (
                  <li key={c.id} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span>
                      <strong>{c.code}</strong> — {c.name}
                    </span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </>
    );
  }

  // LEVEL: students table
  const studentList = students.filter(
    (s) =>
      s.status !== "archived" &&
      match(`${s.profiles?.full_name ?? ""} ${s.matric_number ?? ""} ${s.student_id}`),
  );

  return (
    <>
      <PageHeader
        title={`${level?.name ?? "Level"} · Students`}
        description={`${department?.name ?? ""} · ${faculty?.name ?? ""}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/admin/student-import">Full import tool</Link>
          </Button>
        }
      />
      <Breadcrumbs items={crumbs} />
      <Toolbar search={q} onSearch={setQ} />

      <div className="mt-4 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <SectionCard title="Add student">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={sFull} onChange={(e) => setSFull(e.target.value)} placeholder="Ada Obi" />
            </div>
            <div className="space-y-1.5">
              <Label>Matric number</Label>
              <Input value={sMatric} onChange={(e) => setSMatric(e.target.value)} placeholder="ENG/CPE/20/001" />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} />
            </div>
            <Button className="w-full font-semibold" disabled={busy} onClick={() => void addStudent()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add student
            </Button>
            <div className="border-t border-slate-100 pt-3">
              <Label className="text-xs">Import CSV (SN, Full Name, Matric)</Label>
              <Input
                type="file"
                accept=".csv,text/csv,.txt"
                className="mt-1.5"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importStudentsFile(f);
                }}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Auto-links to this school → faculty → department → level. Duplicates skipped.
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={`Students (${studentList.length})`}>
          {studentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : studentList.length === 0 ? (
            <EmptyState
              title="No students in this level"
              description="Add or import students. They will only see exams for courses they enrol in."
              icon={GraduationCap}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">SN</th>
                    <th className="py-2 pr-2">Full name</th>
                    <th className="py-2 pr-2">Matric</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {studentList.map((s, i) => (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 text-slate-500">{i + 1}</td>
                      <td className="py-2.5 pr-2 font-semibold text-slate-900">
                        {s.profiles?.full_name ?? "—"}
                      </td>
                      <td className="py-2.5 pr-2">{s.matric_number ?? s.student_id}</td>
                      <td className="py-2.5 pr-2">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Suspend"
                            onClick={() => void suspendStudent(s.id)}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Archive"
                            onClick={() => void archiveRow("students", s.id)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <strong>Eligibility:</strong> Students only see exams for courses they are enrolled in under this
        department. Computer Engineering 200 Level cannot see Mechanical courses. Enrol courses under a
        student from the old structure enrol panel, or via Admin → Courses workflows.
      </p>
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
            <button type="button" className="font-semibold text-primary hover:underline" onClick={item.onClick}>
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

function Toolbar({ search, onSearch }: { search: string; onSearch: (v: string) => void }) {
  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        className="pl-9"
        placeholder="Search…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  );
}
