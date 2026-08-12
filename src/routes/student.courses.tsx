import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { useStudentContext } from "@/lib/student";

export const Route = createFileRoute("/student/courses")({
  head: () => ({
    meta: [
      { title: "My Courses — D4EXAM" },
      { name: "description", content: "Courses for your department and level." },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: student, isLoading } = useStudentContext();

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!student) {
    return (
      <EmptyState
        title="Student profile not found"
        description="Ask School Admin to add you under Academic Structure (department and level)."
      />
    );
  }

  const courses = student.courses ?? [];
  const programme = [student.facultyName, student.departmentName, student.levelName]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title="My Courses"
        description={
          [student.matric, programme].filter(Boolean).join(" · ") || "Your programme courses"
        }
      />

      {(student.facultyName || student.departmentName || student.levelName) && (
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-semibold text-slate-900">Your programme</p>
          <p className="mt-1 text-slate-600">
            {[student.facultyName, student.departmentName, student.levelName]
              .filter(Boolean)
              .join(" → ") || "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            You see courses offered to your department and level (for example Computer Engineering
            100 Level — not other departments).
          </p>
        </div>
      )}

      <SectionCard title={`Courses (${courses.length})`}>
        {courses.length === 0 ? (
          <EmptyState
            title="No courses yet"
            description={
              student.departmentId
                ? "Admin has not offered any courses for your department/level yet. Once courses are added under Academic Structure → Level → Courses, they will appear here."
                : "Your account is not linked to a department yet. Ask School Admin to place you under the correct department and level."
            }
            icon={BookOpen}
          />
        ) : (
          <ul className="space-y-3">
            {courses.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {c.code} — {c.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[student.departmentName, student.levelName].filter(Boolean).join(" · ") ||
                        "Programme course"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
