import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Layers } from "lucide-react";
import { PageHeader, SectionCard, EmptyState, NavCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/teacher/courses")({
  head: () => ({
    meta: [
      { title: "My Courses — D4EXAM" },
      {
        name: "description",
        content: "Courses assigned to you by the school administrator.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();

  const statsQ = useQuery({
    queryKey: ["teacher-course-stats", teacher?.teacherId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    staleTime: 3 * 60_000,
    queryFn: async () => {
      if (!teacher) return {} as Record<string, { exams: number; questions: number }>;
      const map: Record<string, { exams: number; questions: number }> = {};
      for (const id of teacher.courseIds) {
        map[id] = { exams: 0, questions: 0 };
      }
      const [{ data: exams }, { data: qs }] = await Promise.all([
        supabase
          .from("examinations")
          .select("course_id")
          .eq("school_id", teacher.schoolId)
          .in("course_id", teacher.courseIds),
        supabase
          .from("questions")
          .select("course_id")
          .eq("school_id", teacher.schoolId)
          .in("course_id", teacher.courseIds),
      ]);
      for (const e of exams ?? []) {
        if (e.course_id && map[e.course_id]) map[e.course_id].exams += 1;
      }
      for (const q of qs ?? []) {
        if (q.course_id && map[q.course_id]) map[q.course_id].questions += 1;
      }
      return map;
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading courses…</p>;

  if (!teacher) {
    return (
      <EmptyState
        title="Teacher profile not found"
        description="Contact School Admin to link your account."
      />
    );
  }

  const stats = statsQ.data ?? {};

  return (
    <>
      <PageHeader
        title="My Courses"
        description={`Assigned by School Admin · ${teacher.fullName} · ${teacher.staffId}`}
      />

      {teacher.courses.length === 0 ? (
        <EmptyState
          title="No courses assigned"
          description="School Admin must assign courses to your staff account under Teachers & Courses or Courses."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teacher.courses.map((c) => {
            const s = stats[c.id] ?? { exams: 0, questions: 0 };
            return (
              <NavCard
                key={c.id}
                to="/teacher/question-bank"
                search={{ course: c.id }}
                ariaLabel={`Open ${c.code} questions`}
                className="p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">{c.code}</p>
                    <h2 className="mt-1 text-base font-extrabold text-slate-900">{c.name}</h2>
                    <p className="mt-1 text-xs text-slate-500">{c.credit_units} units</p>
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 px-2 py-2">
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">Exams</dt>
                    <dd className="text-sm font-bold text-slate-900">{s.exams}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2">
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">Questions</dt>
                    <dd className="text-sm font-bold text-slate-900">{s.questions}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-semibold"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link to="/teacher/question-bank" search={{ course: c.id }}>
                      <Layers className="mr-1.5 h-3.5 w-3.5" />
                      Questions
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="font-semibold"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link to="/teacher/examinations" search={{ course: c.id }}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Exams
                    </Link>
                  </Button>
                </div>
              </NavCard>
            );
          })}
        </div>
      )}

      <SectionCard className="mt-6" title="Assignment rule">
        <p className="text-sm text-slate-600">
          Tap a course card (or <strong>Questions</strong>) to open that course’s question bank only.
          Use <strong>Exams</strong> to manage examinations for the same course.
        </p>
      </SectionCard>
    </>
  );
}
