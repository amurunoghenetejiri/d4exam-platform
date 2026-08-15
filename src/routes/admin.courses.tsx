import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, BookOpen } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/courses")({
  head: () => ({ meta: [{ title: "Courses — D4EXAM" }] }),
  component: Page,
});

type Course = {
  id: string;
  code: string;
  name: string;
  credit_units: number | null;
  status: string;
  department_id: string | null;
  level_id: string | null;
  semester_id: string | null;
  departments: { name: string; code: string | null } | null;
  levels: { name: string } | null;
  semesters: { name: string } | null;
};

type Teacher = {
  id: string;
  staff_id: string;
  profiles: { full_name: string; email?: string } | null;
};

type TeacherCourse = { id: string; teacher_id: string; course_id: string };
type Dept = { id: string; name: string; code: string | null; faculty_id?: string | null };
type Faculty = { id: string; name: string };
type Level = { id: string; name: string };
type Semester = { id: string; name: string; status: string };

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();
  const enabled = Boolean(schoolId);

  const coursesQ = useQuery({
    queryKey: ["admin-courses-live", schoolId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select(
          "id, code, name, credit_units, status, department_id, level_id, semester_id, departments(name, code), levels(name), semesters(name)",
        )
        .eq("school_id", schoolId!)
        .order("code")
        .limit(300);
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("courses")
          .select("id, code, name, credit_units, status, department_id, departments(name, code)")
          .eq("school_id", schoolId!)
          .order("code")
          .limit(300);
        if (e2) throw e2;
        return ((d2 ?? []) as Course[]).map((c) => ({
          ...c,
          level_id: null,
          semester_id: null,
          levels: null,
          semesters: null,
        }));
      }
      return (data ?? []) as Course[];
    },
  });

  const deptsQ = useQuery({
    queryKey: ["admin-courses-depts", schoolId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, code, faculty_id")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("departments")
          .select("id, name, code")
          .eq("school_id", schoolId!)
          .order("name");
        if (e2) throw e2;
        return (d2 ?? []) as Dept[];
      }
      return (data ?? []) as Dept[];
    },
  });

  const facultiesQ = useQuery({
    queryKey: ["admin-courses-faculties", schoolId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faculties")
        .select("id, name")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) return [] as Faculty[];
      return (data ?? []) as Faculty[];
    },
  });

  const levelsQ = useQuery({
    queryKey: ["admin-courses-levels", schoolId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("levels")
        .select("id, name")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) return [] as Level[];
      return (data ?? []) as Level[];
    },
  });

  const semestersQ = useQuery({
    queryKey: ["admin-courses-semesters", schoolId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semesters")
        .select("id, name, status")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) return [] as Semester[];
      return (data ?? []) as Semester[];
    },
  });

  const teachersQ = useRows<Teacher>({
    table: "teachers",
    select: "id, staff_id, profiles(full_name, email)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 200,
    enabled,
  });

  const linksQ = useRows<TeacherCourse>({
    table: "teacher_courses",
    select: "id, teacher_id, course_id",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    limit: 1000,
    enabled,
  });

  const courses = coursesQ.data ?? [];
  const teachers = teachersQ.data ?? [];
  const links = linksQ.data ?? [];
  const depts = deptsQ.data ?? [];
  const faculties = facultiesQ.data ?? [];
  const levels = levelsQ.data ?? [];
  const semesters = semestersQ.data ?? [];
  const activeSemester = semesters.find((s) => String(s.status).toLowerCase() === "active");

  // Filters for the list (simple)
  const [filterSem, setFilterSem] = useState<string>("all");
  const [filterDept, setFilterDept] = useState<string>("all");

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (filterSem === "active" && activeSemester && c.semester_id !== activeSemester.id) return false;
      if (filterSem !== "all" && filterSem !== "active" && c.semester_id !== filterSem) return false;
      if (filterDept !== "all" && c.department_id !== filterDept) return false;
      return true;
    });
  }, [courses, filterSem, filterDept, activeSemester]);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? null;

  const assignedTeacherIds = useMemo(() => {
    if (!selectedCourse) return new Set<string>();
    return new Set(links.filter((l) => l.course_id === selectedCourse.id).map((l) => l.teacher_id));
  }, [links, selectedCourse]);

  const [pendingTeachers, setPendingTeachers] = useState<Set<string> | null>(null);
  const effectiveAssigned = pendingTeachers ?? assignedTeacherIds;

  // Create form — only the essentials
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [units, setUnits] = useState("3");
  const [collegeId, setCollegeId] = useState(""); // filters departments only
  const [departmentId, setDepartmentId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [semesterId, setSemesterId] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const deptsForForm = useMemo(() => {
    if (!collegeId) return depts;
    return depts.filter((d) => d.faculty_id === collegeId);
  }, [depts, collegeId]);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) {
      toast.error("Your account is not linked to a school.");
      return;
    }
    if (!code.trim() || !name.trim()) {
      toast.error("Course code and title are required");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        school_id: schoolId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        credit_units: Number(units) || 0,
        department_id: departmentId || null,
        status: "active",
      };
      if (levelId) payload.level_id = levelId;
      const sem = semesterId || activeSemester?.id || null;
      if (sem) payload.semester_id = sem;

      const { data, error } = await supabase
        .from("courses")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      toast.success(`${code.trim().toUpperCase()} created`);
      setCode("");
      setName("");
      setUnits("3");
      await coursesQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-context"] });
      if (data && typeof data === "object" && "id" in data) {
        setSelectedCourseId(String((data as { id: string }).id));
        setPendingTeachers(new Set());
      }
    } catch (err) {
      toast.error((err as Error).message || "Could not create course");
    } finally {
      setBusy(false);
    }
  }

  async function patchCourse(
    courseId: string,
    patch: { semester_id?: string | null; department_id?: string | null; level_id?: string | null },
  ) {
    if (!schoolId) return;
    try {
      const { error } = await supabase
        .from("courses")
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq("id", courseId)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Course updated");
      await coursesQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-context"] });
    } catch (err) {
      toast.error((err as Error).message || "Could not update");
    }
  }

  function selectCourse(id: string) {
    setSelectedCourseId(id);
    setPendingTeachers(null);
  }

  function toggleTeacher(teacherId: string) {
    setPendingTeachers((prev) => {
      const base = prev ?? new Set(assignedTeacherIds);
      const next = new Set(base);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  }

  async function saveTeachers() {
    if (!schoolId || !selectedCourse) return;
    setAssignBusy(true);
    try {
      const desired = pendingTeachers ?? assignedTeacherIds;
      const current = links.filter((l) => l.course_id === selectedCourse.id);
      const toRemove = current.filter((l) => !desired.has(l.teacher_id));
      if (toRemove.length) {
        const { error } = await supabase
          .from("teacher_courses")
          .delete()
          .in(
            "id",
            toRemove.map((l) => l.id),
          );
        if (error) throw error;
      }
      const existing = new Set(current.map((l) => l.teacher_id));
      const toAdd = [...desired].filter((id) => !existing.has(id));
      if (toAdd.length) {
        const { error } = await supabase.from("teacher_courses").insert(
          toAdd.map((teacher_id) => ({
            school_id: schoolId,
            teacher_id,
            course_id: selectedCourse.id,
          })) as never,
        );
        if (error) throw error;
      }
      toast.success("Teachers saved");
      setPendingTeachers(null);
      await linksQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not save teachers");
    } finally {
      setAssignBusy(false);
    }
  }

  function teacherNames(courseId: string) {
    const ids = new Set(links.filter((l) => l.course_id === courseId).map((l) => l.teacher_id));
    return teachers
      .filter((t) => ids.has(t.id))
      .map((t) => t.profiles?.full_name ?? t.staff_id)
      .join(", ");
  }

  return (
    <>
      <PageHeader
        title="Courses"
        description="Add a course, pick department and semester. Students see matching courses for their department in the active term."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/semesters">Semesters</Link>
          </Button>
        }
      />

      {/* Create — only essentials visible */}
      <SectionCard title="Add course">
        <form className="space-y-3" onSubmit={(e) => void createCourse(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CPE101" required />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Course title" required />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">Select department</option>
                {deptsForForm.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code ? `${d.code} — ` : ""}
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={semesterId || (activeSemester ? "auto" : "")}
                onChange={(e) => {
                  const v = e.target.value;
                  setSemesterId(v === "auto" ? "" : v);
                }}
              >
                <option value="auto">
                  {activeSemester ? `Current: ${activeSemester.name}` : "All year"}
                </option>
                <option value="">All year</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showMore && (
            <div className="grid gap-3 sm:grid-cols-3">
              {faculties.length > 0 && (
                <div className="space-y-1.5">
                  <Label>College (optional)</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={collegeId}
                    onChange={(e) => {
                      setCollegeId(e.target.value);
                      setDepartmentId("");
                    }}
                  >
                    <option value="">All colleges</option>
                    {faculties.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Level (optional)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={levelId}
                  onChange={(e) => setLevelId(e.target.value)}
                >
                  <option value="">Any level</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Units</Label>
                <Input type="number" min={0} value={units} onChange={(e) => setUnits(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save course
            </Button>
            <button
              type="button"
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? "Hide options" : "More options (college, level, units)"}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* List + filters */}
      <SectionCard
        className="mt-6"
        title={`Courses (${filtered.length})`}
        description="Tap a course to change semester/department or assign teachers"
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={filterSem}
            onChange={(e) => setFilterSem(e.target.value)}
          >
            <option value="all">All semesters</option>
            <option value="active">Active semester only</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
          >
            <option value="all">All departments</option>
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {coursesQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="No courses" description="Add a course above, or clear filters." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const active = selectedCourse?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectCourse(c.id)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-1 py-3 text-left",
                      active && "bg-primary/5",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">
                        {c.code} — {c.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">
                          {c.departments?.name ?? "No dept"}
                        </span>{" "}
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">
                          {c.semesters?.name ?? "All year"}
                        </span>
                        {c.levels?.name ? (
                          <>
                            {" "}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5">{c.levels.name}</span>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {teacherNames(c.id) || "No teachers yet"}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Detail panel — only when a course is selected */}
      {selectedCourse && (
        <SectionCard
          className="mt-6"
          title={`${selectedCourse.code} — assign`}
          description="Change where this course belongs, then pick teachers"
        >
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedCourse.department_id || ""}
                onChange={(e) =>
                  void patchCourse(selectedCourse.id, {
                    department_id: e.target.value || null,
                  })
                }
              >
                <option value="">No department</option>
                {depts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Semester</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedCourse.semester_id || ""}
                onChange={(e) =>
                  void patchCourse(selectedCourse.id, {
                    semester_id: e.target.value || null,
                  })
                }
              >
                <option value="">All year</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <BookOpen className="h-4 w-4 text-primary" />
            Teachers ({effectiveAssigned.size})
          </p>

          {teachers.length === 0 ? (
            <p className="text-sm text-slate-500">No teachers yet. Add them under Teachers.</p>
          ) : (
            <>
              <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
                {teachers.map((t) => {
                  const checked = effectiveAssigned.has(t.id);
                  return (
                    <label
                      key={t.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                        checked ? "border-primary/40 bg-primary/5" : "border-slate-200",
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleTeacher(t.id)} />
                      <span className="min-w-0 truncate font-medium">
                        {t.profiles?.full_name ?? t.staff_id}
                      </span>
                      {checked && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                    </label>
                  );
                })}
              </div>
              <Button
                className="mt-3 font-semibold"
                disabled={assignBusy}
                onClick={() => void saveTeachers()}
              >
                {assignBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save teachers
              </Button>
            </>
          )}
        </SectionCard>
      )}
    </>
  );
}
