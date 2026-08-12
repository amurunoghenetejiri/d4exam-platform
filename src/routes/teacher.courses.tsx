import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileText, Layers, Users } from "lucide-react";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";

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
  const assigned = mock.currentTeacher.assignedCourses;
  const courses = mock.studentCourses.filter((c) => assigned.includes(c.code));
  const exams = mock.teacherExams.filter((e) => assigned.includes(e.courseCode ?? e.code));
  const questions = mock.questionBank.filter((q) =>
    assigned.includes(q.courseCode ?? ""),
  );

  return (
    <>
      <PageHeader
        title="My Courses"
        description="Only courses assigned to you by School Admin appear here. You cannot create exams for unassigned courses."
      />

      {courses.length === 0 ? (
        <EmptyState
          title="No courses assigned"
          description="Ask your School Administrator to assign courses to your staff account."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => {
            const courseExams = exams.filter((e) => (e.courseCode ?? e.code) === c.code);
            const courseQs = questions.filter((q) => q.courseCode === c.code);
            return (
              <article
                key={c.code}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-primary">{c.code}</p>
                    <h2 className="mt-1 text-base font-extrabold text-slate-900">{c.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{c.units} units · Assigned by admin</p>
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BookOpen className="h-5 w-5" />
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 px-2 py-2">
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">Exams</dt>
                    <dd className="text-sm font-bold text-slate-900">{courseExams.length}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2">
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">Questions</dt>
                    <dd className="text-sm font-bold text-slate-900">{courseQs.length}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2">
                    <dt className="text-[10px] font-semibold uppercase text-slate-500">Students</dt>
                    <dd className="text-sm font-bold text-slate-900">—</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="font-semibold" asChild>
                    <Link to="/teacher/question-bank">
                      <Layers className="mr-1.5 h-3.5 w-3.5" />
                      Questions
                    </Link>
                  </Button>
                  <Button size="sm" className="font-semibold" asChild>
                    <Link to="/teacher/examinations">
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Exams
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SectionCard className="mt-6" title="Assignment rule">
        <p className="text-sm text-slate-600">
          School Admin assigns teachers to courses. You may only build questions and examinations for
          those courses. Submitting an exam sends it to the Examination Officer — students only see
          it after approval and scheduling.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            <Users className="h-3.5 w-3.5" />
            Admin assigns courses
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            <FileText className="h-3.5 w-3.5" />
            Teacher submits for approval
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1">
            Officer approves → students see exam
          </span>
        </div>
      </SectionCard>
    </>
  );
}
