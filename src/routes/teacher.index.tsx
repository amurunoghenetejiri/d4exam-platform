import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import * as mock from "@/data/mock";
import { BookOpen, FileText, GraduationCap, PenSquare } from "lucide-react";

export const Route = createFileRoute("/teacher/")({
  head: () => ({
    meta: [{ title: "Teacher Dashboard — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader
        title={`Good morning, ${mock.currentTeacher.name}`}
        description="Lecturer · Computer Engineering"
        actions={
          <Button className="font-semibold" asChild>
            <Link to="/teacher/question-bank">Edit questions</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="My Courses" value={4} icon={BookOpen} />
        <Stat label="Examinations" value={8} icon={FileText} />
        <Stat label="Total Students" value={420} icon={GraduationCap} />
        <Stat label="Pending Marking" value={23} icon={PenSquare} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Recent Examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/teacher/examinations">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {mock.studentExams.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {e.code} — {e.title}
                  </p>
                  <p className="text-xs text-slate-500">{e.date}</p>
                </div>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Pending Marking"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/teacher/marking">View All</Link>
            </Button>
          }
        >
          <ul className="space-y-3">
            {mock.submissions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{s.exam}</p>
                  <p className="text-xs text-slate-500">{s.student} · {s.matric}</p>
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FootStat label="Question Bank" value={mock.questionBank.length} sub="Total Questions" />
        <FootStat label="Average Score" value="72.4%" sub="This Semester" />
        <FootStat label="Pass Rate" value="68%" sub="This Semester" />
        <FootStat label="Results" value={4} sub="Published" />
      </div>
    </>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
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

function FootStat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}
