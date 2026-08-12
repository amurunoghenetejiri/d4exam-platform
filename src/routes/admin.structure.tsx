import { createFileRoute } from "@tanstack/react-router";
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
  CheckCircle2,
  Upload,
  Users,
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
    tab: s.tab === "courses" || s.tab === "students" ? s.tab : undefined,
  }),
  head: () => ({ meta: [{ title: "Academic Structure — D4EXAM" }] }),
  component: Page,
});

type Faculty = { id: string; name: string; code: string | null; status: string };
type Department = { id: string; name: string; code: string | null; status: string; faculty_id: string | null };
type Level = { id: string; name: string; code: string | null; status: string };
type StudentRow = {
  id: string;
  student_id: string;
  matric_number: string | null;
  full_name: string | null;
  status: string;
  profiles: { full_name: string } | null;
};
type Course = { id: string; code: string; name: string; status: string };

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
  const tab = search.tab ?? null;

  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const [sFull, setSFull] = useState("");
  const [sMatric, setSMatric] = useState("");
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
    enabled: Boolean(schoolId && departmentId && levelId && tab === "students"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, student_id, matric_number, full_name, status, profiles(full_name)")
        .eq("school_id", schoolId!)
        .eq("department_id", departmentId!)
        .eq("level_id", levelId!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("students")
          .select("id, student_id, matric_number, status, profiles(full_name)")
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

  const levelCoursesQ = useQuery({
    queryKey: ["struct-level-courses", schoolId, departmentId, levelId],
    enabled: Boolean(schoolId && departmentId && levelId && tab === "courses"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, code, name, status")
        .eq("school_id", schoolId!)
        .eq("department_id", departmentId!)
        .eq("level_id", levelId!)
        .order("code");
      if (error) throw error;
      return (data ?? []) as Course[];
    },
  });

  // counts for hub cards
  const courseCountQ = useQuery({
    queryKey: ["struct-course-count", schoolId, departmentId, levelId],
    enabled: Boolean(schoolId && departmentId && levelId && !tab),
    queryFn: async () => {
      const { count } = await supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!)
        .eq("department_id", departmentId!)
        .eq("level_id", levelId!);
      return count ?? 0;
    },
  });

  const studentCountQ = useQuery({
    queryKey: ["struct-student-count", schoolId, departmentId, levelId],
    enabled: Boolean(schoolId && departmentId && levelId && !tab),
    queryFn: async () => {
      const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!)
        .eq("department_id", departmentId!)
        .eq("level_id", levelId!);
      return count ?? 0;
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

  function go(next: {
    faculty?: string;
    department?: string;
    level?: string;
    tab?: "courses" | "students";
  }) {
    void navigate({
      search: {
        faculty: next.faculty,
        department: next.department,
        level: next.level,
        tab: next.tab,
      },
    });
    setQ("");
    setName("");
    setCode("");
    setEditId(null);
    setShowAdd(false);
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
    if (!confirm(`Permanently delete ${label}?`)) return;
    try {
      const { error } = await supabase.from(table).delete().eq("id", id).eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Deleted");
      await qc.invalidateQueries();
      if (table === "faculties" && id === facultyId) go({});
      if (table === "departments" && id === departmentId) go({ faculty: facultyId! });
      if (table === "levels" && id === levelId) go({ faculty: facultyId!, department: departmentId! });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleStudentStatus(s: StudentRow) {
    if (!schoolId) return;
    const next = s.status === "suspended" ? "active" : "suspended";
    try {
      const { error } = await supabase
        .from("students")
        .update({ status: next } as never)
        .eq("id", s.id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success(next === "active" ? "Unsuspended" : "Suspended");
      await studentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function saveFaculty() {
    if (!schoolId || !name.trim()) return toast.error("Name required");
    setBusy(true);
    try {
      if (editId) {
        const { error } = await supabase
          .from("faculties")
          .update({ name: name.trim(), code: code.trim() || null } as never)
          .eq("id", editId);
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
        toast.success("Faculty / College added");
      }
      setName("");
      setCode("");
      setEditId(null);
      setShowAdd(false);
      await facultiesQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveDepartment() {
    if (!schoolId || !facultyId || !name.trim()) return toast.error("Name required");
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
        toast.success("Department added");
      }
      setName("");
      setCode("");
      setEditId(null);
      setShowAdd(false);
      await departmentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLevel() {
    if (!schoolId || !name.trim()) return toast.error("Name required");
    setBusy(true);
    try {
      const { error } = await supabase.from("levels").insert({
        school_id: schoolId,
        name: name.trim(),
        code: code.trim() || null,
        status: "active",
      } as never);
      if (error) throw error;
      toast.success("Level added");
      setName("");
      setCode("");
      setShowAdd(false);
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
      await supabase.from("levels").insert(
        defaults.map((n, i) => ({
          school_id: schoolId,
          name: n,
          code: String(100 + i * 100),
          status: "active",
        })) as never,
      );
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
    if (!sFull.trim() || !sMatric.trim()) return toast.error("Full name and matric required");
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
        toast.error("Matric already exists");
        setBusy(false);
        return;
      }
      const payload: Record<string, unknown> = {
        school_id: schoolId,
        student_id: matric,
        matric_number: matric,
        full_name: sFull.trim(),
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
      setShowAdd(false);
      await studentsQ.refetch();
      await qc.invalidateQueries({ queryKey: ["struct-student-count"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function parseStudentCsv(text: string) {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [] as { full: string; matric: string }[];
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
      header.some((h) => /name|matric|sn|student/.test(h)) && !/^\d+$/.test(header[0] ?? "");
    const nameIdx = header.findIndex((h) => /full\s*name|name/.test(h));
    const matricIdx = header.findIndex((h) => /matric|student\s*id/.test(h));
    const start = looksLikeHeader ? 1 : 0;
    const rows: { full: string; matric: string }[] = [];
    for (let i = start; i < lines.length; i++) {
      const cols = split(lines[i]);
      let full = "";
      let matric = "";
      if (looksLikeHeader && nameIdx >= 0 && matricIdx >= 0) {
        full = cols[nameIdx] ?? "";
        matric = cols[matricIdx] ?? "";
      } else if (cols.length >= 3) {
        full = cols[1] ?? "";
        matric = cols[2] ?? "";
      } else if (cols.length === 2) {
        full = cols[0] ?? "";
        matric = cols[1] ?? "";
      }
      full = full.trim();
      matric = matric.trim();
      if (full && matric && !/^(full\s*name|name)$/i.test(full)) rows.push({ full, matric });
    }
    return rows;
  }

  async function importStudentsFile(file: File) {
    if (!schoolId || !facultyId || !departmentId || !levelId) return;
    const rows = parseStudentCsv(await file.text());
    if (!rows.length) return toast.error("No valid rows. Use: SN, Full Name, Matric");
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
      toast.success(`Imported ${created}${skipped ? `, skipped ${skipped}` : ""}`);
      setShowAdd(false);
      await studentsQ.refetch();
      await qc.invalidateQueries({ queryKey: ["struct-student-count"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLevelCourse() {
    if (!schoolId || !departmentId || !levelId || !cCode.trim() || !cName.trim()) {
      return toast.error("Code and title required");
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
      toast.success("Course added");
      setCCode("");
      setCName("");
      setShowAdd(false);
      await levelCoursesQ.refetch();
      await qc.invalidateQueries({ queryKey: ["struct-course-count"] });
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
    if (faculty) items.push({ label: faculty.name, onClick: () => go({ faculty: faculty.id }) });
    if (department)
      items.push({
        label: department.name,
        onClick: () => go({ faculty: facultyId!, department: department.id }),
      });
    if (level)
      items.push({
        label: level.name,
        onClick: () => go({ faculty: facultyId!, department: departmentId!, level: level.id }),
      });
    if (tab === "courses") items.push({ label: "Courses" });
    if (tab === "students") items.push({ label: "Students" });
    return items;
  }, [faculty, department, level, facultyId, departmentId, tab]);

  // ═══════ FACULTY LIST ═══════
  if (!facultyId) {
    const list = faculties.filter((f) => f.status !== "archived" && match(`${f.name} ${f.code ?? ""}`));
    return (
      <>
        <PageHeader title="Academic Structure" description="Faculty / College → Department → Level" />
        <Breadcrumbs items={crumbs} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Toolbar search={q} onSearch={setQ} />
          <Button
            size="sm"
            className="font-semibold"
            variant={showAdd || editId ? "secondary" : "default"}
            onClick={() => {
              setShowAdd((v) => !v);
              setEditId(null);
              setName("");
              setCode("");
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Faculty / College
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition", (showAdd || editId) && "rotate-180")} />
          </Button>
        </div>

        {(showAdd || editId) && (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:max-w-md">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Faculty / College name" />
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (optional)" />
            <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void saveFaculty()}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {editId ? "Update" : "Save"}
            </Button>
          </div>
        )}

        <SectionCard className="mt-4" title={`Faculty / College (${list.length})`}>
          {facultiesQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : list.length === 0 ? (
            <EmptyState title="No Faculty / College yet" description="Tap Add Faculty / College above." icon={Building2} />
          ) : (
            <ul className="space-y-2">
              {list.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-xl border border-slate-100 p-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => go({ faculty: f.id })}>
                    <p className="font-bold text-slate-900">{f.name}</p>
                    <p className="text-xs text-slate-500">{f.code || "Open departments →"}</p>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(f.id); setName(f.name); setCode(f.code ?? ""); setShowAdd(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => void hardDelete("faculties", f.id, f.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => go({ faculty: f.id })}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </>
    );
  }

  // ═══════ DEPARTMENTS ═══════
  if (facultyId && !departmentId) {
    const list = departments.filter((d) => d.status !== "archived" && match(`${d.name} ${d.code ?? ""}`));
    return (
      <>
        <PageHeader title={faculty?.name ?? "Departments"} description="Departments in this Faculty / College" />
        <Breadcrumbs items={crumbs} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Toolbar search={q} onSearch={setQ} />
          <Button
            size="sm"
            className="font-semibold"
            variant={showAdd || editId ? "secondary" : "default"}
            onClick={() => {
              setShowAdd((v) => !v);
              setEditId(null);
              setName("");
              setCode("");
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add department
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition", (showAdd || editId) && "rotate-180")} />
          </Button>
        </div>

        {(showAdd || editId) && (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:max-w-md">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Department name" />
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (optional)" />
            <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void saveDepartment()}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {editId ? "Update" : "Save"}
            </Button>
          </div>
        )}

        <SectionCard className="mt-4" title={`Departments (${list.length})`}>
          {departmentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : list.length === 0 ? (
            <EmptyState title="No departments" description="Tap Add department above." icon={Blocks} />
          ) : (
            <ul className="space-y-2">
              {list.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-xl border border-slate-100 p-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => go({ faculty: facultyId, department: d.id })}
                  >
                    <p className="font-bold text-slate-900">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.code || "Open levels →"}</p>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditId(d.id); setName(d.name); setCode(d.code ?? ""); setShowAdd(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => void hardDelete("departments", d.id, d.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => go({ faculty: facultyId, department: d.id })}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </>
    );
  }

  // ═══════ LEVELS ═══════
  if (departmentId && !levelId) {
    const list = levels.filter((l) => l.status !== "archived" && match(`${l.name} ${l.code ?? ""}`));
    return (
      <>
        <PageHeader title={department?.name ?? "Levels"} description="Click a level to open Courses & Students" />
        <Breadcrumbs items={crumbs} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Toolbar search={q} onSearch={setQ} />
          <div className="flex gap-2">
            {levels.length === 0 && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void ensureDefaultLevels()}>
                Seed 100–500
              </Button>
            )}
            <Button size="sm" className="font-semibold" variant={showAdd ? "secondary" : "default"} onClick={() => setShowAdd((v) => !v)}>
              <Plus className="mr-1 h-4 w-4" />
              Add level
              <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition", showAdd && "rotate-180")} />
            </Button>
          </div>
        </div>

        {showAdd && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Input className="max-w-[180px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="200 Level" />
            <Input className="w-24" value={code} onChange={(e) => setCode(e.target.value)} placeholder="200" />
            <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void saveLevel()}>
              Save
            </Button>
          </div>
        )}

        <SectionCard className="mt-4" title={`Levels (${list.length})`}>
          {levelsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : list.length === 0 ? (
            <EmptyState title="No levels" description="Seed 100–500 or add a level." icon={Layers} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left font-bold text-slate-900 hover:text-primary"
                    onClick={() => go({ faculty: facultyId!, department: departmentId, level: l.id })}
                  >
                    {l.name}
                  </button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => void hardDelete("levels", l.id, l.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => go({ faculty: facultyId!, department: departmentId, level: l.id })}
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

  // ═══════ LEVEL HUB — two cards ═══════
  if (levelId && !tab) {
    const label = `${level?.name ?? "Level"} · ${department?.name ?? ""}`;
    return (
      <>
        <PageHeader title={level?.name ?? "Level"} description={`${department?.name ?? ""} · ${faculty?.name ?? ""}`} />
        <Breadcrumbs items={crumbs} />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              go({ faculty: facultyId!, department: departmentId!, level: levelId, tab: "courses" })
            }
            className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <p className="mt-4 text-lg font-extrabold text-slate-900 group-hover:text-primary">
              {label} Courses
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {courseCountQ.data ?? "…"} course(s) · Open to add or manage
            </p>
            <p className="mt-3 text-xs font-semibold text-primary">Open courses →</p>
          </button>

          <button
            type="button"
            onClick={() =>
              go({ faculty: facultyId!, department: departmentId!, level: levelId, tab: "students" })
            }
            className="group rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
              <Users className="h-6 w-6" />
            </div>
            <p className="mt-4 text-lg font-extrabold text-slate-900 group-hover:text-primary">
              {label} Students
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {studentCountQ.data ?? "…"} student(s) · Open to add or import
            </p>
            <p className="mt-3 text-xs font-semibold text-primary">Open students →</p>
          </button>
        </div>
      </>
    );
  }

  // ═══════ COURSES TAB ═══════
  if (tab === "courses") {
    return (
      <>
        <PageHeader
          title={`${level?.name ?? ""} Courses`}
          description={`${department?.name ?? ""} · ${faculty?.name ?? ""}`}
        />
        <Breadcrumbs items={crumbs} />
        <div className="mt-3 flex justify-end">
          <Button size="sm" className="font-semibold" variant={showAdd ? "secondary" : "default"} onClick={() => setShowAdd((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" />
            Add course
            <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition", showAdd && "rotate-180")} />
          </Button>
        </div>

        {showAdd && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input className="w-28" value={cCode} onChange={(e) => setCCode(e.target.value)} placeholder="CPE101" />
            </div>
            <div className="min-w-[160px] flex-1 space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Course title" />
            </div>
            <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void saveLevelCourse()}>
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        )}

        <SectionCard className="mt-4" title={`Courses (${levelCourses.length})`}>
          {levelCoursesQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : levelCourses.length === 0 ? (
            <EmptyState title="No courses yet" description="Tap Add course." icon={BookOpen} />
          ) : (
            <ul className="space-y-2">
              {levelCourses.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 text-sm">
                  <span>
                    <strong>{c.code}</strong> — {c.name}
                  </span>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={c.status} />
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => void hardDelete("courses", c.id, c.code)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </>
    );
  }

  // ═══════ STUDENTS TAB ═══════
  const studentList = students.filter(
    (s) => s.status !== "archived" && match(`${displayName(s)} ${s.matric_number ?? ""} ${s.student_id}`),
  );

  return (
    <>
      <PageHeader
        title={`${level?.name ?? ""} Students`}
        description={`${department?.name ?? ""} · ${faculty?.name ?? ""}`}
      />
      <Breadcrumbs items={crumbs} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Toolbar search={q} onSearch={setQ} />
        <Button size="sm" className="font-semibold" variant={showAdd ? "secondary" : "default"} onClick={() => setShowAdd((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          Add student
          <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition", showAdd && "rotate-180")} />
        </Button>
      </div>

      {showAdd && (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Full name</Label>
              <Input value={sFull} onChange={(e) => setSFull(e.target.value)} placeholder="Ada Obi" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Matric number</Label>
              <Input value={sMatric} onChange={(e) => setSMatric(e.target.value)} placeholder="ENG/CPE/20/001" />
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
            <span className="text-[11px] text-slate-500">SN, Full Name, Matric</span>
          </div>
        </div>
      )}

      <SectionCard className="mt-4" title={`Students (${studentList.length})`}>
        {studentsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : studentList.length === 0 ? (
          <EmptyState title="No students yet" description="Tap Add student or Import CSV." icon={GraduationCap} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
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
                {studentList.map((s, i) => {
                  const suspended = s.status === "suspended";
                  return (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 text-slate-500">{i + 1}</td>
                      <td className="py-2.5 pr-2 font-semibold text-slate-900">{displayName(s)}</td>
                      <td className="py-2.5 pr-2">{s.matric_number ?? s.student_id}</td>
                      <td className="py-2.5 pr-2">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="py-2.5">
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs font-semibold" onClick={() => void toggleStudentStatus(s)}>
                          {suspended ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Unsuspend
                            </>
                          ) : (
                            <>
                              <Ban className="h-3.5 w-3.5" /> Suspend
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
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
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-slate-600">
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
    <div className="relative max-w-sm flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input className="pl-9" placeholder="Search…" value={search} onChange={(e) => onSearch(e.target.value)} />
    </div>
  );
}
