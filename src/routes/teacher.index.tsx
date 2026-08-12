import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileText, Layers, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/")({
  head: () => ({
    meta: [{ title: "Teacher Dashboard — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  const teacher = mock.currentTeacher;
  const assigned = teacher.assignedCourses;
  const exams = mock.teacherExams.filter((e) => assigned.includes(e.courseCode ?? e.code));
  const questions = mock.questionBank.filter((q) => assigned.includes(q.courseCode ?? ""));
  const pending = exams.filter((e) => e.status === "pending_approval" || e.status === "changes_requested");
  const drafts = exams.filter((e) => e.status === "draft");

  return (
    <>
      <PageHeader
        title={`Welcome back, ${teacher.name}`}
        description={`${teacher.school} · ${teacher.department} · Staff ${teacher.staffId}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="font-semibold" asChild>
              <Link to="/teacher/question-bank">Question bank</Link>
            </Button>
            <Button className="font-semibold" asChild>
              <Link to="/teacher/examinations">Create examination</Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Assigned courses" value={String(assigned.length)} icon={BookOpen} />
        <Stat label="Questions" value={String(questions.length)} icon={Layers} />
        <Stat label="My examinations" value={String(exams.length)} icon={FileText} />
        <Stat label="Awaiting officer" value={String(pending.length)} icon={Clock} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Assigned courses"
          description="Set by School Admin — you can only teach these"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/teacher/courses">View all</Link>
            </Button>
          }
        >
          {assigned.length === 0 ? (
            <EmptyState title="No courses assigned" description="Admin must assign courses first." />
          ) : (
            <ul className="space-y-2">
              {assigned.map((code) => {
                const c = mock.studentCourses.find((x) => x.code === code);
                return (
                  <li
                    key={code}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{code}</p>
                      <p className="text-xs text-slate-500">{c?.title ?? "Course"}</p>
                    </div>
                    <span className="text-xs font-semibold text-primary">{c?.units ?? "—"} units</span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Examination pipeline"
          description="Draft → submit → officer approval → students"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/teacher/examinations">Manage</Link>
            </Button>
          }
        >
          {exams.length === 0 ? (
            <EmptyState
              title="No examinations yet"
              description="Create one for an assigned course."
              actionLabel="Create examination"
              onAction={() => {
                window.location.href = "/teacher/examinations";
              }}
            />
          ) : (
            <ul className="space-y-3">
              {exams.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.courseCode ?? e.code} · {e.date}
                    </p>
                  </div>
                  <StatusBadge status={String(e.status).replaceAll("_", " ")} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Tip
          icon={AlertCircle}
          title={`${drafts.length} draft(s)`}
          body="Finish and submit drafts for officer approval."
          to="/teacher/examinations"
        />
        <Tip
          icon={Clock}
          title={`${pending.length} with officer"`}
          body="Pending approval or changes requested."
          to="/teacher/examinations"
        />
        <Tip
          icon={CheckCircle2}
          title="Students only see approved exams"
          body="After officer approves and schedules delivery."
          to="/teacher/examinations"
        />
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof BookOpen;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function Tip({
  icon: Icon,
  title,
  body,
  to,
}: {
  icon: typeof Clock;
  title: string;
  body: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{body}</p>
        </div>
      </div>
    </Link>
  );
}
