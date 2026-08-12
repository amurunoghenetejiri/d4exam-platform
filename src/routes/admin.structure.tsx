import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Blocks,
  GraduationCap,
  ChevronRight,
  Loader2,
  Plus,
  BookOpen,
} from "lucide-react";
import { PageHeader, SectionCard, EmptyState, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/structure")({
  head: () => ({
    meta: [{ title: "Academic Structure — D4EXAM" }],
  }),
  component: Page,
});

type Faculty = { id: string; name: string; code: string | null };
type Department = {
  id: string;
  name: string;
  code: string | null;
  faculty_id: string | null;
};
type StudentRow = {
  id: string;
  student_id: string;
  matric_number: string | null;
  status: string;
  department_id: string | null;
  faculty_id: string | null;
  profiles: { full_name: string; email?: string } | null;
};
type Course = { id: string; code: string; name: string; department_id: string | null };

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();

  const [facultyId, setFacultyId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);

  const [fName, setFName] = useState("");
  const [fCode, setFCode] = useState("");
  const [dName, setDName] = useState("");
  const [dCode, setDCode] = useState("");
  const [busy, setBusy] = useState(false);

  const facultiesQ = useQuery({
    queryKey: ["admin-faculties", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faculties")
        .select("id, name, code")
        .eq("school_id", schoolId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Faculty[];
    },
  });

  const departmentsQ = useQuery({
    queryKey: ["admin-departments", schoolId, facultyId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      let q = supabase
        .from("departments")
        .select("id, name, code, faculty_id")
        .eq("school_id", schoolId!)
        .order("name");
      if (facultyId) q = q.eq("faculty_id", facultyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });

  const studentsQ = useQuery({
    queryKey: ["admin-structure-students", schoolId, departmentId, facultyId],
    enabled: Boolean(schoolId && (departmentId || facultyId)),
    queryFn: async () => {
      let q = supabase
        .from("students")
        .select("id, student_id, matric_number, status, department_id, faculty_id, profiles(full_name, email)")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (departmentId) q = q.eq("department_id", departmentId);
      else if (facultyId) q = q.eq("faculty_id", facultyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  const coursesQ = useQuery({
    queryKey: ["admin-structure-courses", schoolId, departmentId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      let q = supabase
        .from("courses")
        .select("id, code, name, department_id")
        .eq("school_id", schoolId!)
        .order("code");
      if (departmentId) q = q.eq("department_id", departmentId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Course[];
    },
  });

  const enrollQ = useQuery({
    queryKey: ["admin-student-enroll", studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_courses")
        .select("id, course_id")
        .eq("student_id", studentId!);
      if (error) throw error;
      return new Set((data ?? []).map((r) => (r as { course_id: string }).course_id));
    },
  });

  const [pendingCourses, setPendingCourses] = useState<Set<string> | null>(null);
  const enrolled = pendingCourses ?? enrollQ.data ?? new Set<string>();

  const faculties = facultiesQ.data ?? [];
  const departments = departmentsQ.data ?? [];
  const students = studentsQ.data ?? [];
  const courses = coursesQ.data ?? [];

  const selectedFaculty = faculties.find((f) => f.id === facultyId) ?? null;
  const selectedDept = departments.find((d) => d.id === departmentId) ?? null;
  const selectedStudent = students.find((s) => s.id === studentId) ?? null;

  async function createFaculty() {
    if (!schoolId || !fName.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("faculties").insert({
        school_id: schoolId,
        name: fName.trim(),
        code: fCode.trim() || null,
        status: "active",
      } as never);
      if (error) throw error;
      toast.success("College / Faculty created");
      setFName("");
      setFCode("");
      await facultiesQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createDepartment() {
    if (!schoolId || !dName.trim()) return;
    if (!facultyId) {
      toast.error("Select a college / faculty first");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("departments").insert({
        school_id: schoolId,
        faculty_id: facultyId,
        name: dName.trim(),
        code: dCode.trim() || null,
        status: "active",
      } as never);
      if (error) throw error;
      toast.success("Department created");
      setDName("");
      setDCode("");
      await departmentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function assignStudentToDept(sid: string) {
    if (!departmentId || !schoolId) return;
    try {
      const { error } = await supabase
        .from("students")
        .update({
          department_id: departmentId,
          faculty_id: facultyId,
        } as never)
        .eq("id", sid)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Student moved into this department");
      await studentsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function toggleCourse(cid: string) {
    setPendingCourses((prev) => {
      const base = prev ?? new Set(enrollQ.data ?? []);
      const next = new Set(base);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  async function saveEnrolment() {
    if (!schoolId || !studentId) return;
    setBusy(true);
    try {
      const desired = pendingCourses ?? enrollQ.data ?? new Set<string>();
      const { data: existing } = await supabase
        .from("student_courses")
        .select("id, course_id")
        .eq("student_id", studentId);
      const current = existing ?? [];
      const toRemove = current.filter((r) => !desired.has((r as { course_id: string }).course_id));
      if (toRemove.length) {
        await supabase
          .from("student_courses")
          .delete()
          .in(
            "id",
            toRemove.map((r) => (r as { id: string }).id),
          );
      }
      const have = new Set(current.map((r) => (r as { course_id: string }).course_id));
      const toAdd = [...desired].filter((id) => !have.has(id));
      if (toAdd.length) {
        await supabase.from("student_courses").insert(
          toAdd.map((course_id) => ({
            school_id: schoolId,
            student_id: studentId,
            course_id,
            status: "enrolled",
          })) as never,
        );
      }
      toast.success("Course enrolment saved");
      setPendingCourses(null);
      await enrollQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-my-courses"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const unassignedStudentsQ = useQuery({
    queryKey: ["admin-unassigned-students", schoolId, departmentId],
    enabled: Boolean(schoolId && departmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, student_id, matric_number, status, department_id, profiles(full_name)")
        .eq("school_id", schoolId!)
        .is("department_id", null)
        .limit(100);
      if (error) throw error;
      return (data ?? []) as StudentRow[];
    },
  });

  return (
    <>
      <PageHeader
        title="Academic Structure"
        description="College / Faculty → Department → Students. Enrol students in courses so they only see their exams."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-900">Path:</span>
        <button type="button" className="text-primary" onClick={() => { setFacultyId(null); setDepartmentId(null); setStudentId(null); }}>
          School
        </button>
        {selectedFaculty && (
          <>
            <ChevronRight className="h-3 w-3" />
            <button type="button" className="text-primary" onClick={() => { setDepartmentId(null); setStudentId(null); }}>
              {selectedFaculty.name}
            </button>
          </>
        )}
        {selectedDept && (
          <>
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold">{selectedDept.name}</span>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colleges */}
        <SectionCard title="1. College / Faculty" description="e.g. College of Engineering">
          <div className="mb-3 space-y-2 rounded-xl border border-slate-100 p-3">
            <Label className="text-xs font-semibold">New college</Label>
            <Input placeholder="Name" value={fName} onChange={(e) => setFName(e.target.value)} />
            <Input placeholder="Code (ENG)" value={fCode} onChange={(e) => setFCode(e.target.value)} />
            <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void createFaculty()}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add college
            </Button>
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {faculties.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => {
                    setFacultyId(f.id);
                    setDepartmentId(null);
                    setStudentId(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                    facultyId === f.id ? "bg-primary/10 font-bold text-primary" : "hover:bg-slate-50",
                  )}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              </li>
            ))}
            {faculties.length === 0 && (
              <p className="text-xs text-slate-500">No colleges yet. Add College of Engineering, etc.</p>
            )}
          </ul>
        </SectionCard>

        {/* Departments */}
        <SectionCard title="2. Departments" description="e.g. Computer Engineering">
          {!facultyId ? (
            <p className="text-sm text-slate-500">Select a college first.</p>
          ) : (
            <>
              <div className="mb-3 space-y-2 rounded-xl border border-slate-100 p-3">
                <Label className="text-xs font-semibold">New department under {selectedFaculty?.name}</Label>
                <Input placeholder="Name" value={dName} onChange={(e) => setDName(e.target.value)} />
                <Input placeholder="Code (CPE)" value={dCode} onChange={(e) => setDCode(e.target.value)} />
                <Button size="sm" className="font-semibold" disabled={busy} onClick={() => void createDepartment()}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add department
                </Button>
              </div>
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {departments.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setDepartmentId(d.id);
                        setStudentId(null);
                        setPendingCourses(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                        departmentId === d.id ? "bg-primary/10 font-bold text-primary" : "hover:bg-slate-50",
                      )}
                    >
                      <Blocks className="h-4 w-4 shrink-0" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SectionCard>

        {/* Students */}
        <SectionCard title="3. Students" description="In this department">
          {!departmentId ? (
            <p className="text-sm text-slate-500">Select a department to see its students.</p>
          ) : studentsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <>
              <ul className="mb-4 max-h-48 space-y-1 overflow-y-auto">
                {students.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setStudentId(s.id);
                        setPendingCourses(null);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                        studentId === s.id ? "bg-primary/10 font-bold text-primary" : "hover:bg-slate-50",
                      )}
                    >
                      <GraduationCap className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 truncate">
                        {s.profiles?.full_name ?? s.matric_number ?? s.student_id}
                      </span>
                    </button>
                  </li>
                ))}
                {students.length === 0 && (
                  <p className="text-xs text-slate-500">No students linked to this department yet.</p>
                )}
              </ul>

              {(unassignedStudentsQ.data ?? []).length > 0 && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                  <p className="mb-2 text-xs font-semibold text-amber-900">Unassigned students — put into this department</p>
                  <ul className="max-h-32 space-y-1 overflow-y-auto">
                    {(unassignedStudentsQ.data ?? []).map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{s.profiles?.full_name ?? s.student_id}</span>
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void assignStudentToDept(s.id)}>
                          Add here
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </div>

      {selectedStudent && (
        <SectionCard
          className="mt-6"
          title={`Enrol courses · ${selectedStudent.profiles?.full_name ?? selectedStudent.student_id}`}
          description="Tick courses this student takes. Only those exams will appear on their dashboard."
        >
          {courses.length === 0 ? (
            <EmptyState
              title="No courses for this department"
              description="Create courses under Admin → Courses and set department_id, or create school-wide courses."
              icon={BookOpen}
            />
          ) : (
            <div className="space-y-3">
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {courses.map((c) => {
                  const checked = enrolled.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm",
                        checked ? "border-primary/40 bg-primary/5" : "border-slate-200",
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleCourse(c.id)} className="mt-0.5" />
                      <span>
                        <span className="font-bold">{c.code}</span> — {c.name}
                      </span>
                    </label>
                  );
                })}
              </div>
              <Button className="font-semibold" disabled={busy} onClick={() => void saveEnrolment()}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save enrolment
              </Button>
            </div>
          )}
        </SectionCard>
      )}
    </>
  );
}
