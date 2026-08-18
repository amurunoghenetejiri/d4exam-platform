import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Layers } from "lucide-react";
import { PageHeader, SectionCard, EmptyState, NavCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";
import { shortDisplayName } from "@/lib/utils";

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
        description={`Assigned by School Admin · ${shortDisplayName(teacher.fullName)} · ${teacher.staffId}`}
      />

      {teacher.courses.length === 0 ? (
        <EmptyState
          title="No courses assigned"
          description="School Admin must assign courses to your staff account under Teachers & Courses or Courses."
        />
      ) : (
        <div className="grid gap-2 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teacher.courses.map((c) => {
            const s = stats[c.id] ?? { exams: 0, questions: 0 };
            return (
              <NavCard
                key={c.id}
                to="/teacher/question-bank"
                search={{ course: c.id }}
                ariaLabel={`Open ${c.code} questions`}
                className="p-2.5 sm:p-4 lg:p-5"
              >
                <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-primary sm:text-xs">{c.code}</p>
                    <h2 className="mt-0 truncate text-[13px] font-extrabold leading-snug text-slate-900 sm:mt-1 sm:text-base">{c.name}</h2>
                    <p className="mt-0 text-[10px] leading-tight text-slate-500 sm:mt-1 sm:text-xs">{c.credit_units} units</p>
                  </div>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary sm:h-10 sm:w-10 sm:rounded-xl">
                    <BookOpen className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                  </span>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-1 text-center sm:mt-4 sm:gap-2">
                  <div className="rounded-md bg-slate-50 px-1.5 py-1 sm:rounded-lg sm:px-2 sm:py-2">
                    <dt className="text-[9px] font-semibold uppercase text-slate-500 sm:text-[10px]">Exams</dt>
                    <dd className="text-xs font-bold text-slate-900 sm:text-sm">{s.exams}</dd>
                  </div>
                  <div className="rounded-md bg-slate-50 px-1.5 py-1 sm:rounded-lg sm:px-2 sm:py-2">
                    <dt className="text-[9px] font-semibold uppercase text-slate-500 sm:text-[10px]">Questions</dt>
                    <dd className="text-xs font-bold text-slate-900 sm:text-sm">{s.questions}</dd>
                  </div>
                </dl>

                <div className="mt-2 flex flex-wrap gap-1 sm:mt-4 sm:gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px] font-semibold sm:h-9 sm:px-3 sm:text-sm"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link to="/teacher/question-bank" search={{ course: c.id }}>
                      <Layers className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      Questions
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[11px] font-semibold sm:h-9 sm:px-3 sm:text-sm"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link to="/teacher/examinations" search={{ course: c.id }}>
                      <FileText className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />
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
