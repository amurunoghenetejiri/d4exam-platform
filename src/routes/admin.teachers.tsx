import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, Check, Loader2, UserPlus } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createSchoolUser } from "@/lib/auth.school-admin.functions";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/teachers")({
  head: () => ({
    meta: [{ title: "Teachers & Course Assignment — D4EXAM" }],
  }),
  component: Page,
});

type Teacher = {
  id: string;
  staff_id: string;
  employment_status: string;
  profiles: { full_name: string; email?: string } | null;
};

type Course = {
  id: string;
  code: string;
  name: string;
  credit_units: number | null;
};

type TeacherCourse = {
  id: string;
  teacher_id: string;
  course_id: string;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const schoolCode = user?.schoolCode ?? "";
  const createOne = useServerFn(createSchoolUser);
  const qc = useQueryClient();
  const enabled = Boolean(schoolId);

  const teachersQ = useRows<Teacher>({
    table: "teachers",
    select: "id, staff_id, employment_status, profiles(full_name, email)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 300,
    enabled,
  });

  const coursesQ = useRows<Course>({
    table: "courses",
    select: "id, code, name, credit_units",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "code", ascending: true },
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

  const teachers = teachersQ.data ?? [];
  const courses = coursesQ.data ?? [];
  const links = linksQ.data ?? [];

  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const selectedTeacher =
    teachers.find((t) => t.id === selectedTeacherId) ?? teachers[0] ?? null;

  const assignedCourseIds = useMemo(() => {
    if (!selectedTeacher) return new Set<string>();
    return new Set(
      links.filter((l) => l.teacher_id === selectedTeacher.id).map((l) => l.course_id),
    );
  }, [links, selectedTeacher]);

  const [pendingCourses, setPendingCourses] = useState<Set<string> | null>(null);
  const effectiveCourses = pendingCourses ?? assignedCourseIds;

  function selectTeacher(id: string) {
    setSelectedTeacherId(id);
    setPendingCourses(null);
  }

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [staffId, setStaffId] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  async function addTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) {
      toast.error("Your account is not linked to a school.");
      return;
    }
    setBusy(true);
    try {
      await createOne({
        data: {
          role: "teacher",
          firstName: firstName.trim(),
          lastName: lastName.trim() || "Teacher",
          email: email.trim().toLowerCase(),
          identifier: staffId.trim(),
        },
      });
      toast.success(
        `Teacher created. Login with school code + Staff ID; password = Staff ID (${staffId.trim()}).`,
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      setStaffId("");
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await teachersQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not create teacher");
    } finally {
      setBusy(false);
    }
  }

  function toggleCourse(courseId: string) {
    setPendingCourses((prev) => {
      const base = prev ?? new Set(assignedCourseIds);
      const next = new Set(base);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  async function saveAssignments() {
    if (!schoolId || !selectedTeacher) return;
    setAssignBusy(true);
    try {
      const desired = pendingCourses ?? assignedCourseIds;
      const current = links.filter((l) => l.teacher_id === selectedTeacher.id);

      const toRemove = current.filter((l) => !desired.has(l.course_id));
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

      const existing = new Set(current.map((l) => l.course_id));
      const toAdd = [...desired].filter((id) => !existing.has(id));
      if (toAdd.length) {
        const { error } = await supabase.from("teacher_courses").insert(
          toAdd.map((course_id) => ({
            school_id: schoolId,
            teacher_id: selectedTeacher.id,
            course_id,
          })) as never,
        );
        if (error) throw error;
      }

      const names = courses
        .filter((c) => desired.has(c.id))
        .map((c) => c.code)
        .join(", ");
      toast.success(
        `Courses saved for ${selectedTeacher.profiles?.full_name ?? "teacher"}: ${names || "none"}`,
      );
      setPendingCourses(null);
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await linksQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not save assignments");
    } finally {
      setAssignBusy(false);
    }
  }

  function coursesForTeacher(teacherId: string) {
    const ids = new Set(links.filter((l) => l.teacher_id === teacherId).map((l) => l.course_id));
    return courses.filter((c) => ids.has(c.id));
  }

  return (
    <>
      <PageHeader
        title="Teachers & Course Assignment"
        description="Live teachers only. Create a teacher, create courses under Courses, then assign them here or on the Courses page."
      />

      {!schoolId && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your account is not linked to a school yet.
        </p>
      )}

      <SectionCard
        title="Assign courses to teacher (live)"
        description="Only teachers and courses that exist in your school database appear here — no sample data."
      >
        {teachersQ.isLoading || coursesQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : teachers.length === 0 ? (
          <EmptyState
            title="No teachers yet"
            description="Create a teacher with the form below, then assign courses."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                1. Select teacher
              </p>
              <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {teachers.map((t) => {
                  const assigned = coursesForTeacher(t.id);
                  const active = (selectedTeacher?.id ?? selectedTeacherId) === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => selectTeacher(t.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-slate-200 bg-white hover:border-slate-300",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-900">
                              {t.profiles?.full_name ?? "Teacher"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t.staff_id}
                              {t.profiles?.email ? ` · ${t.profiles.email}` : ""}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-primary">
                              {assigned.length === 0
                                ? "No courses assigned"
                                : assigned.map((c) => c.code).join(", ")}
                            </p>
                          </div>
                          <StatusBadge status={t.employment_status || "active"} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                2. Tick courses for{" "}
                {selectedTeacher?.profiles?.full_name ?? "teacher"}
              </p>
              {courses.length === 0 ? (
                <EmptyState
                  title="No courses in this school"
                  description="Create courses first under Courses, then assign them here."
                  actionLabel="Go to Courses"
                  onAction={() => {
                    window.location.href = "/admin/courses";
                  }}
                />
              ) : !selectedTeacher ? (
                <EmptyState title="Select a teacher" description="Choose someone from the list." />
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-slate-800">
                      {selectedTeacher.profiles?.full_name}
                    </span>
                    <span className="text-slate-500">
                      · {effectiveCourses.size} course(s) selected
                    </span>
                  </div>

                  <div className="grid max-h-[320px] gap-2 overflow-y-auto sm:grid-cols-2">
                    {courses.map((c) => {
                      const checked = effectiveCourses.has(c.id);
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors",
                            checked
                              ? "border-primary/40 bg-primary/5"
                              : "border-slate-200 bg-white hover:bg-slate-50",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCourse(c.id)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold text-slate-900">{c.code}</span>
                            <span className="block text-xs text-slate-500">{c.name}</span>
                          </span>
                          {checked && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </label>
                      );
                    })}
                  </div>

                  <Button
                    className="mt-4 font-semibold"
                    onClick={() => void saveAssignments()}
                    disabled={assignBusy || !schoolId}
                  >
                    {assignBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save course assignment
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add teacher">
          <form className="space-y-3" onSubmit={addTeacher}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Staff ID (also their password)</Label>
              <Input
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
                minLength={4}
              />
            </div>
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Create teacher
            </Button>
            <p className="text-xs text-slate-500">
              Login: school code <strong>{schoolCode || "—"}</strong> + email/staff ID · password =
              Staff ID. Then assign courses above or on{" "}
              <Link to="/admin/courses" className="font-semibold text-primary hover:underline">
                Courses
              </Link>
              .
            </p>
          </form>
        </SectionCard>

        <SectionCard title="How assignment works">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Create teachers on this page (saved to the database).</li>
            <li>
              Create courses under{" "}
              <Link to="/admin/courses" className="font-semibold text-primary hover:underline">
                Courses
              </Link>
              .
            </li>
            <li>Assign teachers ↔ courses here or from the Courses page.</li>
            <li>
              Teachers only see assigned courses in My Courses, Question Bank, and Exam Builder.
            </li>
          </ol>
        </SectionCard>
      </div>
    </>
  );
}
