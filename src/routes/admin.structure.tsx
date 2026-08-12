import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Blocks,
  GraduationCap,
  ChevronRight,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Pencil,
  BookOpen,
  Layers,
  Trash2,
  Ban,
  Upload,
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
  full_name: string | null;
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

function displayName(s: StudentRow) {
  return (s.full_name || s.profiles?.full_name || "").trim() || "—";
}

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
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [sFull, setSFull] = useState("");
  const [sMatric, setSMatric] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [cCode, setCCode] = useState("");
  const [cName, setCName] = useState("");

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
          "id, student_id, matric_number, full_name, status, department_id, faculty_id, level_id, profiles(full_name, email)",
        )
        .eq("school_id", schoolId!)
        .eq("department_id", departmentId!)
        .eq("level_id", levelId!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) {
        // fallback if full_name column not migrated yet
        const { data: d2, error: e2 } = await supabase
          .from("students")
          .select(
            "id, student_id, matric_number, status, department_id, faculty_id, level_id, profiles(full_name, email)",
          )
          .eq("school_id", schoolId!)
          .eq("department_id", departmentId!)
          .eq("level_id", levelId!)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (e2) throw e2;
        return ((d2 ?? []) as StudentRow[]).map((s) => ({ ...s, full_name: null }));
      }
      return (data ?? []) as StudentRow[];
    },
  });

  // Courses for THIS level only
  const levelCoursesQ = useQuery({
    queryKey: ["struct-level-courses", schoolId, departmentId, levelId],
    enabled: Boolean(schoolId && departmentId && levelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, code, name, department_id, level_id, status")
        .eq("school_id", schoolId!)
        .eq("department_id", departmentId!)
        .eq("level_id", levelId!)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Course[];
    },
  });

  const faculties = facultiesQ.data ?? [];
  const departments = departmentsQ.data ?? [];
  const levels = levelsQ.data ?? [];
  const students = studentsQ.data ?? [];
  const levelCourses = levelCoursesQ.data ?? [];

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
    setShowAddStudent(false);
    setShowAddCourse(false);
  }

  function match(text: string) {
    if (!q.trim()) return true;
    return text.toLowerCase().includes(q.trim().toLowerCase());
  }

  async function hardDelete(
    table: "faculties" | "departments" | "levels" | "courses",
    id: string,
    label: string,
  ) {
    if (!schoolId) return;
    if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from(table).delete().eq("id", id).eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Deleted");
      await qc.invalidateQueries();
      if (table === "faculties" && id === facultyId) go({});
      if (table === "departments" && id === departmentId) go({ faculty: facultyId! });
      if (table === "levels" && id === levelId)
        go({ faculty: facultyId!, department: departmentId! });
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
        toast.success("Updated");
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
        toast.success("Updated");
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
        toast.success("Updated");
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
      toast.success("Levels 100–500 added");
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
      const fullName = sFull.trim();
      const { data: dup } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .or(`matric_number.eq.${matric},student_id.eq.${matric}`)
        .maybeSingle();
      if (dup) {
        toast.error(`Matric ${matric} already exists`);
        setBusy(false);
        return;
      }

      const payload: Record<string, unknown> = {
        school_id: schoolId,
        student_id: matric,
        matric_number: matric,
        full_name: fullName,
        faculty_id: facultyId,
        department_id: departmentId,
        level_id: levelId,
        status: "active",
      };

      let { error } = await supabase.from("students").insert(payload as never);
      if (error && /full_name/i.test(error.message)) {
        delete payload.full_name;
        ({ error } = await supabase.from("students").insert(payload as never));
      }
      if (error) throw error;

      toast.success("Student added");
      setSFull("");
      setSMatric("");
      setSEmail("");
      setShowAddStudent(false);
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
      .replace(/\r/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 1) return [] as { full: string; matric: string }[];

    const split = (line: string) => {
      const out: string[] = [];
      let cur = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          quoted = !quoted;
          continue;
        }
        if ((c === "," || c === "\t" || c === ";") && !quoted) {
          out.push(cur.trim());
          cur = "";
          continue;
        }
        cur += c;
      }
      out.push(cur.trim());
      return out.map((x) => x.replace(/^"|"$/g, "").trim());
    };

    const header = split(lines[0]).map((h) => h.toLowerCase());
    const looksLikeHeader =
      header.some((h) => /name|matric|sn|s\/?n|student/.test(h)) &&
      !/^\d+$/.test(header[0] ?? "");

    let nameIdx = header.findIndex((h) =>
      /full\s*name|student\s*name|name/.test(h),
    );
    let matricIdx = header.findIndex((h) => /matric|student\s*id|admission/.test(h));
    let snIdx = header.findIndex((h) => /^(sn|s\/?n|#|no)$/.test(h));

    const start = looksLikeHeader ? 1 : 0;
    const rows: { full: string; matric: string }[] = [];

    for (let i = start; i < lines.length; i++) {
      const cols = split(lines[i]);
      if (!cols.length) continue;

      let full = "";
      let matric = "";

      if (looksLikeHeader && nameIdx >= 0 && matricIdx >= 0) {
        full = cols[nameIdx] ?? "";
        matric = cols[matricIdx] ?? "";
      } else if (cols.length >= 3) {
        // SN, Full Name, Matric
        full = cols[1] ?? "";
        matric = cols[2] ?? "";
      } else if (cols.length === 2) {
        // Full Name, Matric
        full = cols[0] ?? "";
        matric = cols[1] ?? "";
      }

      full = full.trim();
      matric = matric.trim();
      if (!full || !matric) continue;
      if (/^(full\s*name|name|student)$/i.test(full)) continue;
      rows.push({ full, matric });
    }
    return rows;
  }

  async function importStudentsFile(file: File) {
    if (!schoolId || !facultyId || !departmentId || !levelId) return;
    const text = await file.text();
    const rows = parseStudentCsv(text);
    if (!rows.length) {
      toast.error("No valid rows. CSV format: SN, Full Name, Matric Number");
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
        const payload: Record<string, unknown> = {
          school_id: schoolId,
          student_id: r.matric,
          matric_number: r.matric,
          full_name: r.full,
          faculty_id: facultyId,
          department_id: departmentId,
          level_id: levelId,
          status: "active",
        };
        let { error } = await supabase.from("students").insert(payload as never);
        if (error && /full_name/i.test(error.message)) {
          delete payload.full_name;
          ({ error } = await supabase.from("students").insert(payload as never));
        }
        if (!error) created++;
        else skipped++;
      }
      toast.success(
        `Imported ${created} student(s)${skipped ? `, skipped ${skipped}` : ""}`,
      );
      setShowAddStudent(false);
      await studentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLevelCourse() {
    if (!schoolId || !departmentId || !levelId || !cName.trim() || !cCode.trim()) {
      toast.error("Course code and title required");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("courses").insert({
        school_id: schoolId,
        department_id: departmentId,
        level_id: levelId,
        code: cCode.trim().toUpperCase(),
        name: cName.trim(),
        status: "active",
      } as never);
      if (error) throw error;
      toast.success(`Course added to ${level?.name ?? "this level"}`);
      setCCode("");
      setCName("");
      setShowAddCourse(false);
      await levelCoursesQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const crumbs = useMemo(() => {
    const items: { label: string; onClick?: () => void }[] = [
      { label: "Academic Structure", onClick: () => go({}) },
    ];
    if (faculty) {
      items.push({ label: faculty.name, onClick: () => go({ faculty: faculty.id }) });
    }
    if (department) {
      items.push({
        label: department.name,
        onClick: () => go({ faculty: facultyId!, department: department.id }),
      });
    }
    if (level) items.push({ label: level.name });
    return items;
  }, [faculty, department, level, facultyId]);

  // ─── ROOT: Faculty / College only ───
  if (!facultyId) {
    const list = faculties.filter(
      (f) => f.status !== "archived" && match(`${f.name} ${f.code ?? ""}`),
    );
    return (
      <>
        <PageHeader
          title="Academic Structure"
          description="Faculty / College → Department → Level → Courses & Students"
        />
        <Breadcrumbs items={crumbs} />
        <Toolbar search={q} onSearch={setQ} />

        <div className="mt-4 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <SectionCard title={editId ? "Edit" : "Add Faculty / College"}>
            <div className="space-y-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Faculty of Engineering"
              />
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ENG" />
              <Button className="font-semibold" disabled={busy} onClick={() => void saveFaculty()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editId ? "Update" : "Add"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title={`Faculty / College (${list.length})`}>
            {facultiesQ.isLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : list.length === 0 ? (
              <EmptyState title="None yet" description="Add Engineering, Science…" icon={Building2} />
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
                      <p className="text-xs text-slate-500">{f.code || "—"}</p>
                    </button>
                    <div className="flex items-center gap-1">
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
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => void hardDelete("faculties", f.id, f.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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

  // ─── FACULTY: departments only ───
  if (facultyId && !departmentId) {
    const list = departments.filter(
      (d) => d.status !== "archived" && match(`${d.name} ${d.code ?? ""}`),
    );
    return (
      <>
        <PageHeader title={faculty?.name ?? "Departments"} description="Departments in this Faculty / College" />
        <Breadcrumbs items={crumbs} />
        <Toolbar search={q} onSearch={setQ} />

        <div className="mt-4 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <SectionCard title={editId ? "Edit department" : "Add department"}>
            <div className="space-y-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Computer Engineering"
              />
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CPE" />
              <Button className="font-semibold" disabled={busy} onClick={() => void saveDepartment()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editId ? "Update" : "Add"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title={`Departments (${list.length})`}>
            {departmentsQ.isLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : list.length === 0 ? (
              <EmptyState title="No departments" description="Add Computer Engineering…" icon={Blocks} />
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
                      <p className="text-xs text-slate-500">{d.code || "—"}</p>
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
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => void hardDelete("departments", d.id, d.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
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

  // ─── DEPARTMENT: levels ONLY (no courses mixed) ───
  if (departmentId && !levelId) {
    const list = levels.filter((l) => l.status !== "archived" && match(`${l.name} ${l.code ?? ""}`));
    return (
      <>
        <PageHeader
          title={department?.name ?? "Department"}
          description="Choose a level. Courses and students live inside each level."
        />
        <Breadcrumbs items={crumbs} />
        <Toolbar search={q} onSearch={setQ} />

        <SectionCard
          className="mt-4"
          title="Levels"
          description="100 Level, 200 Level… Click one to manage its courses and students."
          action={
            levels.length === 0 ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void ensureDefaultLevels()}>
                Seed 100–500
              </Button>
            ) : undefined
          }
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <Input
              className="max-w-[200px]"
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
              <Plus className="mr-1 h-4 w-4" /> Add level
            </Button>
          </div>

          {levelsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : list.length === 0 ? (
            <EmptyState title="No levels" description="Add 100 Level or seed defaults." icon={Layers} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left font-bold text-slate-900 hover:text-primary"
                    onClick={() =>
                      go({ faculty: facultyId!, department: departmentId, level: l.id })
                    }
                  >
                    {l.name}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => void hardDelete("levels", l.id, l.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      go({ faculty: facultyId!, department: departmentId, level: l.id })
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </>
    );
  }

  // ─── LEVEL PAGE: courses for this level + students ───
  const studentList = students.filter(
    (s) =>
      s.status !== "archived" &&
      match(`${displayName(s)} ${s.matric_number ?? ""} ${s.student_id}`),
  );

  return (
    <>
      <PageHeader
        title={level?.name ?? "Level"}
        description={`${department?.name ?? ""} · ${faculty?.name ?? ""}`}
      />
      <Breadcrumbs items={crumbs} />
      <Toolbar search={q} onSearch={setQ} />

      {/* Courses for THIS level only */}
      <SectionCard
        className="mt-4"
        title={`Courses · ${level?.name ?? ""}`}
        description="Only courses for this level (e.g. 100 Level courses stay here)."
        action={
          <Button
            size="sm"
            variant={showAddCourse ? "secondary" : "outline"}
            className="font-semibold"
            onClick={() => setShowAddCourse((v) => !v)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add course
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition", showAddCourse && "rotate-180")} />
          </Button>
        }
      >
        {showAddCourse && (
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input
                className="w-28"
                value={cCode}
                onChange={(e) => setCCode(e.target.value)}
                placeholder="CPE101"
              />
            </div>
            <div className="min-w-[180px] flex-1 space-y-1">
              <Label className="text-xs">Title</Label>
              <Input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Introduction to Computer Engineering"
              />
            </div>
            <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void saveLevelCourse()}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Save course
            </Button>
          </div>
        )}

        {levelCoursesQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : levelCourses.length === 0 ? (
          <EmptyState
            title="No courses for this level"
            description="Click Add course to attach CPE101, MTH101, etc. to this level only."
            icon={BookOpen}
          />
        ) : (
          <ul className="space-y-2">
            {levelCourses.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <span>
                  <strong>{c.code}</strong> — {c.name}
                </span>
                <div className="flex items-center gap-1">
                  <StatusBadge status={c.status} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => void hardDelete("courses", c.id, c.code)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Assign teachers under{" "}
          <Link className="font-semibold text-primary" to="/admin/courses">
            Admin → Courses
          </Link>
          .
        </p>
      </SectionCard>

      {/* Students — list first, compact add */}
      <SectionCard
        className="mt-6"
        title={`Students (${studentList.length})`}
        action={
          <Button
            size="sm"
            className="font-semibold"
            variant={showAddStudent ? "secondary" : "default"}
            onClick={() => setShowAddStudent((v) => !v)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add student
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition", showAddStudent && "rotate-180")} />
          </Button>
        }
      >
        {showAddStudent && (
          <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Full name</Label>
                <Input value={sFull} onChange={(e) => setSFull(e.target.value)} placeholder="Ada Obi" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Matric number</Label>
                <Input
                  value={sMatric}
                  onChange={(e) => setSMatric(e.target.value)}
                  placeholder="ENG/CPE/20/001"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email (optional)</Label>
                <Input type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void addStudent()}>
                {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Add student
              </Button>
              <Label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary">
                <Upload className="h-3.5 w-3.5" />
                Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importStudentsFile(f);
                    e.target.value = "";
                  }}
                />
              </Label>
              <span className="text-[11px] text-slate-500">Format: SN, Full Name, Matric Number</span>
            </div>
          </div>
        )}

        {studentsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : studentList.length === 0 ? (
          <EmptyState
            title="No students yet"
            description="Use Add student or Import CSV. Full names from the file are saved."
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
                    <td className="py-2.5 pr-2 font-semibold text-slate-900">{displayName(s)}</td>
                    <td className="py-2.5 pr-2">{s.matric_number ?? s.student_id}</td>
                    <td className="py-2.5 pr-2">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-2.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Suspend"
                        onClick={() => void suspendStudent(s.id)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
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
