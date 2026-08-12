import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { useStudentContext } from "@/lib/student";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student/courses")({
  head: () => ({
    meta: [
      { title: "My Courses — D4EXAM" },
      { name: "description", content: "Courses registered for your programme." },
    ],
  }),
  component: Page,
});

type EnrollRow = {
  id: string;
  status: string;
  course_id: string;
  courses: {
    code: string;
    name: string;
    credit_units: number | null;
    department_id: string | null;
    departments: { name: string; code: string | null } | null;
  } | null;
};

function Page() {
  const { data: student, isLoading: sLoading } = useStudentContext();

  const enrollQ = useQuery({
    queryKey: ["student-my-courses", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      if (!student) return [] as EnrollRow[];
      const { data, error } = await supabase
        .from("student_courses")
        .select(
          "id, status, course_id, courses(code, name, credit_units, department_id, departments(name, code))",
        )
        .eq("student_id", student.studentId)
        .eq("school_id", student.schoolId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EnrollRow[];
    },
  });

  const deptQ = useQuery({
    queryKey: ["student-dept", student?.studentId],
    enabled: Boolean(student?.studentId),
    queryFn: async () => {
      if (!student) return null;
      const { data } = await supabase
        .from("students")
        .select("department_id, faculty_id, departments(name, code), faculties(name, code)")
        .eq("id", student.studentId)
        .maybeSingle();
      return data as {
        department_id: string | null;
        faculty_id: string | null;
        departments: { name: string; code: string | null } | null;
        faculties: { name: string; code: string | null } | null;
      } | null;
    },
  });

  if (sLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!student) {
    return (
      <EmptyState
        title="Student profile not found"
        description="Ask School Admin to link your account and enrol you in courses."
      />
    );
  }

  const rows = enrollQ.data ?? [];
  const faculty = deptQ.data?.faculties;
  const department = deptQ.data?.departments;

  return (
    <>
      <PageHeader
        title="My Courses"
        description={
          [
            student.matric,
            faculty?.name,
            department?.name,
          ]
            .filter(Boolean)
            .join(" · ") || "Your registered courses"
        }
      />

      {(faculty || department) && (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-semibold text-slate-900">Your programme</p>
          <p className="mt-1 text-slate-600">
            {faculty?.name ?? "College / Faculty not set"}
            {department ? ` → ${department.name}` : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            You only see examinations for courses you are enrolled in (e.g. Computer Engineering
            courses — not Maritime).
          </p>
        </div>
      )}

      <SectionCard title={`Enrolled courses (${rows.length})`}>
        {enrollQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading courses…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description="School Admin must enrol you in courses under your department. Until then, exam lists stay empty."
            icon={BookOpen}
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {r.courses?.code ?? "—"} — {r.courses?.name ?? "Course"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.courses?.departments?.name ?? "Department TBC"}
                    {r.courses?.credit_units != null ? ` · ${r.courses.credit_units} units` : ""}
                  </p>
                </div>
                <StatusBadge status={r.status || "enrolled"} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
