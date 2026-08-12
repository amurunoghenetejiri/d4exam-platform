import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, Check, Loader2, UserPlus } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createSchoolUser } from "@/lib/auth.functions";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { toast } from "sonner";
import * as mock from "@/data/mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/teachers")({
  head: () => ({
    meta: [{ title: "Teachers & Course Assignment — D4EXAM" }],
  }),
  component: Page,
});

type TeacherRow = {
  id: string;
  staff_id: string;
  employment_status: string;
  profiles: { full_name: string; email?: string } | null;
};

const ALL_COURSES = mock.studentCourses;

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const schoolCode = user?.schoolCode ?? "";
  const createOne = useServerFn(createSchoolUser);
  const qc = useQueryClient();

  const list = useRows<TeacherRow>({
    table: "teachers",
    select: "id, staff_id, employment_status, profiles(full_name, email)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 200,
    enabled: Boolean(schoolId),
  });

  const [teachers, setTeachers] = useState(() =>
    mock.teachers.map((t) => ({
      id: t.id,
      name: t.name,
      staffId: t.staffId,
      department: t.department,
      status: t.status,
      assigned: [...t.assigned] as string[],
    })),
  );
  const [selectedId, setSelectedId] = useState(teachers[0]?.id ?? "");
  const selected = teachers.find((t) => t.id === selectedId) ?? teachers[0];

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [staffId, setStaffId] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleCourse(code: string) {
    if (!selected) return;
    setTeachers((prev) =>
      prev.map((t) => {
        if (t.id !== selected.id) return t;
        const has = t.assigned.includes(code);
        return {
          ...t,
          assigned: has ? t.assigned.filter((c) => c !== code) : [...t.assigned, code],
        };
      }),
    );
  }

  function saveAssignments() {
    if (!selected) return;
    toast.success(
      `Saved for ${selected.name}: ${selected.assigned.join(", ") || "no courses"}. That teacher can only create questions and exams for these courses.`,
    );
  }

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
      toast.success(`Teacher created. Password = Staff ID (${staffId.trim()}).`)
      const newId = `t-${Date.now()}`;
      setTeachers((prev) => [
        {
          id: newId,
          name: `${firstName.trim()} ${lastName.trim() || "Teacher"}`.trim(),
          staffId: staffId.trim(),
          department: "—",
          status: "active",
          assigned: [],
        },
        ...prev,
      ]);
      setSelectedId(newId);
      setFirstName("");
      setLastName("");
      setEmail("");
      setStaffId("");
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await list.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not create teacher");
    } finally {
      setBusy(false);
    }
  }

  const dbTeachers = list.data ?? [];

  return (
    <>
      <PageHeader
        title="Teachers & Course Assignment"
        description="Select a teacher on the left, tick the courses they teach, then Save. Teachers can only build questions and exams for assigned courses."
      />

      {/* Primary: Assign courses — this is what admins need first */}
      <SectionCard
        title="Assign courses to a teacher"
        description="This is how a teacher gets courses. Without assignment, their Question Bank and Exam Builder stay empty."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
          {/* Teacher picker */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              1. Select teacher
            </p>
            <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {teachers.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                      selectedId === t.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{t.name}</p>
                        <p className="text-xs text-slate-500">
                          {t.staffId} · {t.department}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-primary">
                          {t.assigned.length === 0
                            ? "No courses assigned"
                            : `${t.assigned.length} course(s): ${t.assigned.join(", ")}`}
                        </p>
                      </div>
                      <StatusBadge status={t.status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Course checklist */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              2. Tick courses for {selected?.name ?? "…"}
            </p>
            {!selected ? (
              <EmptyState title="Select a teacher" description="Choose someone from the list." />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-slate-800">{selected.name}</span>
                  <span className="text-slate-500">currently has</span>
                  <span className="font-bold text-primary">
                    {selected.assigned.length === 0 ? "none" : selected.assigned.join(", ")}
                  </span>
                </div>

                <div className="grid max-h-[320px] gap-2 overflow-y-auto sm:grid-cols-2">
                  {ALL_COURSES.map((c) => {
                    const checked = selected.assigned.includes(c.code);
                    return (
                      <label
                        key={c.code}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors",
                          checked
                            ? "border-primary/40 bg-primary/5"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleCourse(c.code)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-slate-900">{c.code}</span>
                          <span className="block text-xs text-slate-500">{c.title}</span>
                          <span className="block text-[11px] text-slate-400">{c.units} units</span>
                        </span>
                        {checked && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button className="font-semibold" onClick={saveAssignments}>
                    <Check className="mr-1.5 h-4 w-4" />
                    Save course assignment
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setTeachers((prev) =>
                        prev.map((t) => (t.id === selected.id ? { ...t, assigned: [] } : t)),
                      )
                    }
                  >
                    Clear all
                  </Button>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  After saving, this teacher’s My Courses, Question Bank, and Exam Builder only show
                  the courses you ticked.
                </p>
              </>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add new teacher">
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
              Staff ID. Then assign courses above.
            </p>
          </form>
        </SectionCard>

        <SectionCard title="Teachers in database">
          {dbTeachers.length === 0 ? (
            <EmptyState
              title="No DB teachers yet"
              description="Create one, or use the assignment panel above with the demo teachers."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dbTeachers.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">{t.profiles?.full_name ?? "—"}</p>
                    <p className="text-xs text-slate-500">
                      {t.staff_id}
                      {t.profiles?.email ? ` · ${t.profiles.email}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={t.employment_status || "active"} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
