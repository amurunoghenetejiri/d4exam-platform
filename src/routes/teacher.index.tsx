import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { BookOpen, FileText, GraduationCap, Layers } from "lucide-react";
import { useCount, useRows } from "@/lib/queries";
import { useSessionUser } from "@/lib/session";

export const Route = createFileRoute("/teacher/")({
  head: () => ({
    meta: [{ title: "Teacher Dashboard — D4EXAM" }],
  }),
  component: Page,
});

type Exam = {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const enabled = Boolean(schoolId);

  const courses = useCount("courses", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);
  const exams = useCount("examinations", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);
  const students = useCount("students", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);
  const questions = useCount("questions", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);

  const recentExams = useRows<Exam>({
    table: "examinations",
    select: "id, title, status, scheduled_start",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 6,
    enabled,
  });

  return (
    <>
      <PageHeader
        title={`Welcome back${user?.fullName ? `, ${user.fullName}` : ""}`}
        description={user?.schoolName ? `${user.schoolName} · Teacher` : "Teacher dashboard"}
        actions={
          <Button className="font-semibold" asChild>
            <Link to="/teacher/question-bank">Question bank</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Courses" value={fmt(courses)} icon={BookOpen} />
        <Stat label="Examinations" value={fmt(exams)} icon={FileText} />
        <Stat label="Students" value={fmt(students)} icon={GraduationCap} />
        <Stat label="Questions" value={fmt(questions)} icon={Layers} />
      </div>

      <div className="mt-6">
        <SectionCard
          title="Recent examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/teacher/examinations">View All</Link>
            </Button>
          }
        >
          {(recentExams.data ?? []).length === 0 ? (
            <EmptyState title="No examinations" description="Exams for your school will appear here." />
          ) : (
            <ul className="space-y-3">
              {(recentExams.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.scheduled_start ? new Date(e.scheduled_start).toLocaleString() : "Not scheduled"}
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function fmt(q: { isLoading: boolean; data?: number }) {
  return q.isLoading ? "…" : String(q.data ?? 0);
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
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
