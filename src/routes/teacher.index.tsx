import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Layers, Clock } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState, NavCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/teacher/")({
  head: () => ({
    meta: [{ title: "Teacher Dashboard — D4EXAM" }],
  }),
  component: Page,
});

type ExamRow = {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  course_id: string | null;
  courses: { code: string; name: string } | null;
};

function Page() {
  const { data: teacher, isLoading, isFetching } = useTeacherContext();

  const examsQ = useQuery({
    queryKey: ["teacher-exams-dash", teacher?.teacherId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    staleTime: 3 * 60_000,
    queryFn: async () => {
      if (!teacher) return [] as ExamRow[];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, scheduled_start, course_id, courses(code, name)")
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  const questionsQ = useQuery({
    queryKey: ["teacher-q-count", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    staleTime: 3 * 60_000,
    queryFn: async () => {
      if (!teacher) return 0;
      const { count, error } = await supabase
        .from("questions")
        .select("*", { count: "exact", head: true })
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds);
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (isLoading && !teacher) {
    return <p className="text-sm text-slate-500">Loading your dashboard…</p>;
  }

  if (!teacher) {
    return (
      <EmptyState
        title="Teacher profile not found"
        description="Your login is not linked to a teacher record for this school. Contact School Admin."
      />
    );
  }

  const exams = examsQ.data ?? [];
  const pending = exams.filter((e) =>
    ["pending_approval", "changes_requested"].includes(e.status),
  ).length;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${teacher.fullName}`}
        description={`${teacher.schoolName ?? "School"} · Staff ID ${teacher.staffId} · ${teacher.email}${isFetching ? " ·" : ""}`}
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
        <Stat to="/teacher/courses" label="Assigned courses" value={String(teacher.courses.length)} icon={BookOpen} />
        <Stat to="/teacher/question-bank" label="Questions" value={String(questionsQ.data ?? 0)} icon={Layers} />
        <Stat to="/teacher/examinations" label="Examinations" value={String(exams.length)} icon={FileText} />
        <Stat to="/teacher/examinations" label="Awaiting officer" value={String(pending)} icon={Clock} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Your assigned courses"
          description="Only courses School Admin assigned to you"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/teacher/courses">View all</Link>
            </Button>
          }
        >
          {teacher.courses.length === 0 ? (
            <EmptyState
              title="No courses assigned"
              description="Ask School Admin to assign courses under Teachers & Courses or Courses."
            />
          ) : (
            <ul className="space-y-2">
              {teacher.courses.map((c) => (
                <li key={c.id}>
                  <NavCard
                    to="/teacher/question-bank"
                    search={{ course: c.id }}
                    ariaLabel={`Open questions for ${c.code}`}
                    className="flex items-center justify-between rounded-xl border-slate-100 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{c.code}</p>
                      <p className="text-xs text-slate-500">{c.name}</p>
                    </div>
                    <span className="text-xs font-semibold text-primary">{c.credit_units} units</span>
                  </NavCard>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Your examinations"
          description="Draft → submit → officer approval"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/teacher/examinations">Manage</Link>
            </Button>
          }
        >
          {exams.length === 0 ? (
            <EmptyState
              title="No examinations yet"
              description="Create an exam for an assigned course."
              actionLabel="Create examination"
              onAction={() => {
                window.location.assign("/teacher/examinations");
              }}
            />
          ) : (
            <ul className="space-y-3">
              {exams.map((e) => (
                <li key={e.id}>
                  <NavCard
                    to="/teacher/examinations"
                    search={e.course_id ? { course: e.course_id } : undefined}
                    ariaLabel={`Open examinations for ${e.title}`}
                    className="flex items-center justify-between gap-3 rounded-xl border-slate-100 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                      <p className="text-xs text-slate-500">
                        {e.courses?.code ?? "—"} ·{" "}
                        {e.scheduled_start
                          ? new Date(e.scheduled_start).toLocaleString()
                          : "Not scheduled"}
                      </p>
                    </div>
                    <StatusBadge status={String(e.status).replaceAll("_", " ")} />
                  </NavCard>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function Stat({
  to,
  label,
  value,
  icon: Icon,
}: {
  to: string;
  label: string;
  value: string;
  icon: typeof BookOpen;
}) {
  return (
    <NavCard to={to} ariaLabel={label}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </NavCard>
  );
}
