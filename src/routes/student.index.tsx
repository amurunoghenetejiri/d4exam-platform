import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  ClipboardList,
  Trophy,
  Bell,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState, NavCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useStudentContext, STUDENT_VISIBLE_EXAM_STATUSES, examAvailability } from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/")({
  head: () => ({ meta: [{ title: "Student Dashboard — D4EXAM" }] }),
  component: Page,
});

type ExamRow = {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_minutes: number | null;
  courses: { code: string; name: string } | null;
};

type AttemptRow = { exam_id: string; status: string };

type ResultRow = {
  id: string;
  exam_id: string;
  percentage: number | null;
  grade: string | null;
  pass_fail: string | null;
  status: string;
  created_at: string | null;
  examinations: { title: string; courses: { code: string } | null } | null;
};

type Notif = { id: string; title: string; created_at: string; read_at: string | null };

function Page() {
  const { data: student, isLoading: sLoading } = useStudentContext();
  const { data: user } = useSessionUser();

  const examsQ = useQuery({
    queryKey: ["student-dashboard-exams", student?.schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(student?.schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("examinations")
        .select("id, title, status, scheduled_start, scheduled_end, duration_minutes, course_id, courses(code, name)")
        .eq("school_id", student!.schoolId)
        .in("status", [...STUDENT_VISIBLE_EXAM_STATUSES])
        .order("scheduled_start", { ascending: true })
        .limit(40);
      if (student?.courseIds?.length) q = q.in("course_id", student.courseIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["student-dashboard-attempts", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("exam_id, status")
        .eq("student_id", student!.studentId);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["student-dashboard-results", student?.studentId],
    enabled: Boolean(student?.studentId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, percentage, grade, pass_fail, status, created_at, examinations(title, courses(code))",
        )
        .eq("student_id", student!.studentId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const notifsQ = useQuery({
    queryKey: ["student-dashboard-notifs", user?.userId],
    enabled: Boolean(user?.userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, created_at, read_at")
        .eq("recipient_user_id", user!.userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const attemptsByExam = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of attemptsQ.data ?? []) m.set(a.exam_id, a.status);
    return m;
  }, [attemptsQ.data]);

  const exams = examsQ.data ?? [];
  const results = resultsQ.data ?? [];
  const notifs = notifsQ.data ?? [];
  const written = (attemptsQ.data ?? []).filter((a) =>
    ["submitted", "terminated", "flagged"].includes(String(a.status).toLowerCase()),
  ).length;

  const upcoming = exams.filter((e) => {
    const avail = examAvailability(e.scheduled_start, e.scheduled_end);
    const done = ["submitted", "terminated", "flagged"].includes(
      String(attemptsByExam.get(e.id) || "").toLowerCase(),
    );
    return !done && avail !== "ended";
  });

  if (sLoading) {
    return <p className="text-sm text-slate-500">Loading dashboard…</p>;
  }

  return (
    <>
      <PageHeader
        title={student?.fullName ? `Welcome, ${student.fullName.split(" ")[0]}` : "Student dashboard"}
        description="Your examinations, results, and notifications."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat to="/student/examinations" label="Exams" value={upcoming.length} icon={ClipboardList} color="bg-blue-50 text-primary" />
        <MiniStat to="/student/history" label="Written" value={written} icon={BookOpen} color="bg-violet-50 text-violet-600" />
        <MiniStat to="/student/results" label="Results" value={results.length} icon={Trophy} color="bg-amber-50 text-amber-600" />
        <MiniStat to="/student/notifications" label="Alerts" value={notifs.filter((n) => !n.read_at).length} icon={Bell} color="bg-rose-50 text-rose-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Upcoming examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">View All</Link>
            </Button>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming exams" description="Approved examinations will appear here." />
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 5).map((e) => (
                <li key={e.id}>
                  <NavCard
                    to="/student/exam/$id"
                    params={{ id: e.id }}
                    ariaLabel={`Open ${e.title}`}
                    className="flex items-center justify-between gap-2 rounded-lg border-slate-100 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{e.courses?.code ? `${e.courses.code} · ` : ""}{e.title}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <CalendarDays className="h-3 w-3" />
                        {e.scheduled_start ? new Date(e.scheduled_start).toLocaleString() : "Schedule TBC"}
                      </p>
                    </div>
                    <StatusBadge status={e.status} />
                  </NavCard>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent results"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/results">View All</Link>
            </Button>
          }
        >
          {results.length === 0 ? (
            <EmptyState title="No results yet" description="Published results will show here after officer release." />
          ) : (
            <ul className="space-y-2">
              {results.slice(0, 3).map((r) => {
                const isPub = (r.status || "").toLowerCase() === "published";
                return (
                  <li key={r.id}>
                    <NavCard
                      to="/student/results/$id"
                      params={{ id: r.id }}
                      ariaLabel={`Results for ${r.examinations?.title ?? "exam"}`}
                      className="flex items-center justify-between gap-2 rounded-lg border-slate-100 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {r.examinations?.courses?.code ? `${r.examinations.courses.code} · ` : ""}
                          {r.examinations?.title ?? "Exam"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {isPub
                            ? `${r.percentage != null ? `${r.percentage}%` : "—"}${r.grade ? ` · ${r.grade}` : ""}`
                            : "Pending officer review"}
                        </p>
                      </div>
                      <StatusBadge status={isPub ? "Released" : "Held"} />
                    </NavCard>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function MiniStat({
  to,
  label,
  value,
  icon: Icon,
  color,
}: {
  to: string;
  label: string;
  value: number;
  icon: typeof Trophy;
  color: string;
}) {
  return (
    <NavCard to={to} ariaLabel={label}>
      <div className="flex items-center gap-3">
        <div className={cn("grid h-10 w-10 place-items-center rounded-xl", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-extrabold tabular-nums text-slate-900">{value}</p>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
        </div>
        <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
      </div>
    </NavCard>
  );
}
