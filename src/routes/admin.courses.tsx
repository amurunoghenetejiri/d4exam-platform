import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, BookOpen } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  departments: { name: string; code: string | null } | null;
};

type Teacher = {
  id: string;
  staff_id: string;
  employment_status: string;
  profiles: { full_name: string; email?: string } | null;
};

type TeacherCourse = {
  id: string;
  teacher_id: string;
  course_id: string;
};

type Dept = { id: string; name: string; code: string | null };

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
        .select("id, code, name, credit_units, status, department_id, departments(name, code)")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Course[];
    },
  });

  const deptsQ = useQuery({
    queryKey: ["admin-courses-depts", schoolId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, code")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Dept[];
    },
  });

  const teachersQ = useRows<Teacher>({
    table: "teachers",
    select: "id, staff_id, employment_status, profiles(full_name, email)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 300,
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

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? courses[0] ?? null;

  const assignedTeacherIds = useMemo(() => {
    if (!selectedCourse) return new Set<string>();
    return new Set(links.filter((l) => l.course_id === selectedCourse.id).map((l) => l.teacher_id));
  }, [links, selectedCourse]);

  const [pendingTeachers, setPendingTeachers] = useState<Set<string> | null>(null);
  const effectiveAssigned = pendingTeachers ?? assignedTeacherIds;

  function selectCourse(id: string) {
    setSelectedCourseId(id);
    setPendingTeachers(null);
  }

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [units, setUnits] = useState("3");
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

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
      const { data, error } = await supabase
        .from("courses")
        .insert({
          school_id: schoolId,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          credit_units: Number(units) || 0,
          department_id: departmentId || null,
          status: "active",
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      toast.success(`Course ${code.trim().toUpperCase()} created`);
      setCode("");
      setName("");
      setUnits("3");
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await coursesQ.refetch();
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

  function toggleTeacher(teacherId: string) {
    setPendingTeachers((prev) => {
      const base = prev ?? new Set(assignedTeacherIds);
      const next = new Set(base);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  }

  async function saveAssignments() {
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

      const existingIds = new Set(current.map((l) => l.teacher_id));
      const toAdd = [...desired].filter((id) => !existingIds.has(id));
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

      toast.success(`Teachers saved for ${selectedCourse.code}: ${desired.size} assigned`);
      setPendingTeachers(null);
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await linksQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not save assignments");
    } finally {
      setAssignBusy(false);
    }
  }

  function teachersForCourse(courseId: string) {
    const ids = new Set(links.filter((l) => l.course_id === courseId).map((l) => l.teacher_id));
    return teachers.filter((t) => ids.has(t.id));
  }

  return (
    <>
      <PageHeader
        title="Courses"
        description="Create courses under a department, then assign teachers. Teachers only manage courses you assign."
        actions={
          <Button variant="outline" asChild>
            <Link to="/admin/structure">Academic Structure</Link>
          </Button>
        }
      />

      {!schoolId && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your account is not linked to a school yet.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Create course">
          <form className="space-y-3" onSubmit={createCourse}>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={departmentId || "none"} onValueChange={(v) => setDepartmentId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No department yet</SelectItem>
                  {depts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.code ? `${d.code} — ` : ""}
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                Create departments under Academic Structure first.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Course code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. CPE101"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Course title</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Introduction to Computer Engineering"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Credit units</Label>
              <Input
                type="number"
                min={0}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder="3"
              />
            </div>
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create course
            </Button>
          </form>
        </SectionCard>

        <SectionCard title="School courses (live)">
          {coursesQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading courses…</p>
          ) : courses.length === 0 ? (
            <EmptyState
              title="No courses yet"
              description="Create a course with the form. Then assign teachers below."
            />
          ) : (
            <ul className="max-h-[320px] space-y-2 overflow-y-auto">
              {courses.map((c) => {
                const assigned = teachersForCourse(c.id);
                const active = (selectedCourse?.id ?? selectedCourseId) === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectCourse(c.id)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">
                            {c.code} — {c.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {c.departments?.name ?? "No department"} · {c.credit_units ?? 0} units ·{" "}
                            {assigned.length === 0
                              ? "No teachers"
                              : assigned.map((t) => t.profiles?.full_name ?? t.staff_id).join(", ")}
                          </p>
                        </div>
                        <StatusBadge status={c.status || "active"} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        className="mt-6"
        title="Assign teachers to course"
        description="Select a course, tick teachers, save. Teachers only manage assigned courses."
      >
        {!selectedCourse ? (
          <EmptyState title="Select or create a course first" description="Pick a course to assign teachers." />
        ) : teachers.length === 0 ? (
          <EmptyState
            title="No teachers yet"
            description="Create teachers under Teachers & Courses, then return."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="font-bold text-slate-900">
                {selectedCourse.code} — {selectedCourse.name}
              </span>
              <span className="text-slate-500">· {effectiveAssigned.size} teacher(s)</span>
            </div>

            <div className="grid max-h-[360px] gap-2 overflow-y-auto sm:grid-cols-2">
              {teachers.map((t) => {
                const checked = effectiveAssigned.has(t.id);
                return (
                  <label
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors",
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleTeacher(t.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900">
                        {t.profiles?.full_name ?? "Teacher"}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {t.staff_id}
                        {t.profiles?.email ? ` · ${t.profiles.email}` : ""}
                      </span>
                    </span>
                    {checked && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </label>
                );
              })}
            </div>

            <Button
              className="font-semibold"
              onClick={() => void saveAssignments()}
              disabled={assignBusy || !schoolId}
            >
              {assignBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save teacher assignment
            </Button>
          </div>
        )}
      </SectionCard>
    </>
  );
}
