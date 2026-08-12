import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createSchoolUser } from "@/lib/auth.functions";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/admin/teachers")({
  head: () => ({
    meta: [{ title: "Teachers — D4EXAM" }],
  }),
  component: Page,
});

type TeacherRow = {
  id: string;
  staff_id: string;
  employment_status: string;
  profiles: { full_name: string; email?: string } | null;
};

/** Local assignment state mirrors admin → teacher course linkage */
const ALL_COURSES = mock.studentCourses.map((c) => c.code);

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

  // Demo roster when DB empty
  const [demoTeachers, setDemoTeachers] = useState(() =>
    mock.teachers.map((t) => ({
      id: t.id,
      name: t.name,
      staffId: t.staffId,
      department: t.department,
      status: t.status,
      assigned: [...t.assigned],
    })),
  );
  const [assignFor, setAssignFor] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [staffId, setStaffId] = useState("");
  const [busy, setBusy] = useState(false);

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
        `Teacher created. They log in with school code + email/staff ID, password = staff ID (${staffId.trim()}).`,
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      setStaffId("");
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await qc.invalidateQueries({ queryKey: ["count"] });
      await list.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not create teacher");
    } finally {
      setBusy(false);
    }
  }

  function toggleCourse(teacherId: string, code: string) {
    setDemoTeachers((prev) =>
      prev.map((t) => {
        if (t.id !== teacherId) return t;
        const has = t.assigned.includes(code);
        return {
          ...t,
          assigned: has ? t.assigned.filter((c) => c !== code) : [...t.assigned, code],
        };
      }),
    );
  }

  function saveAssignments(teacherId: string) {
    const t = demoTeachers.find((x) => x.id === teacherId);
    toast.success(
      `Courses saved for ${t?.name ?? "teacher"}: ${(t?.assigned ?? []).join(", ") || "none"}. Teacher can only build exams for these.`,
    );
    setAssignFor(null);
  }

  const dbTeachers = list.data ?? [];

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Add teachers and assign courses. Teachers can only create questions and exams for assigned courses."
      />

      <SectionCard title="How teachers log in">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>
            School code: <strong>{schoolCode || "—"}</strong>
          </li>
          <li>Username: email or Staff ID</li>
          <li>
            Password: <strong>their Staff ID</strong>
          </li>
        </ol>
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
              <Input value={staffId} onChange={(e) => setStaffId(e.target.value)} required minLength={4} />
            </div>
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create teacher
            </Button>
          </form>
        </SectionCard>

        <SectionCard title="Teacher list (live database)">
          {dbTeachers.length === 0 ? (
            <EmptyState title="No teachers in database yet" description="Create a teacher or use the assignment panel below for demo teachers." />
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

      <SectionCard
        className="mt-6"
        title="Assign courses to teachers"
        description="Teachers only see these courses in Question Bank and Exam Builder."
      >
        <ul className="space-y-4">
          {demoTeachers.map((t) => (
            <li key={t.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.staffId} · {t.department}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    Assigned: {t.assigned.length ? t.assigned.join(", ") : "None"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <StatusBadge status={t.status} />
                  <Button
                    size="sm"
                    variant={assignFor === t.id ? "default" : "outline"}
                    className="font-semibold"
                    onClick={() => setAssignFor(assignFor === t.id ? null : t.id)}
                  >
                    {assignFor === t.id ? "Close" : "Assign courses"}
                  </Button>
                </div>
              </div>

              {assignFor === t.id && (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ALL_COURSES.map((code) => {
                      const title =
                        mock.studentCourses.find((c) => c.code === code)?.title ?? code;
                      const checked = t.assigned.includes(code);
                      return (
                        <label
                          key={code}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-100 px-3 py-2"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCourse(t.id, code)}
                          />
                          <span className="text-sm">
                            <span className="font-bold">{code}</span>
                            <span className="text-slate-500"> — {title}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <Button className="font-semibold" onClick={() => saveAssignments(t.id)}>
                    Save course assignments
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}
