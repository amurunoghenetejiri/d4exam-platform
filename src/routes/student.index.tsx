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
  History,
  User,
  Hash,
  Building2,
  GraduationCap,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  EmptyState,
  NavCard,
} from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import {
  useStudentContext,
  STUDENT_VISIBLE_EXAM_STATUSES,
  examAvailability,
} from "@/lib/student";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
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
  released_at: string | null;
  created_at: string | null;
  examinations: { title: string; courses: { code: string } | null } | null;
};

type Notif = { id: string; title: string; created_at: string; read_at: string | null };

function Page() {
  const { data: student, isLoading: sLoading } = useStudentContext();
  const { data: user } = useSessionUser();

  useRealtimeInvalidate(
    `student-dash-${student?.studentId ?? "anon"}`,
    [
      { table: "examinations" },
      { table: "exam_attempts", filter: student?.studentId ? `student_id=eq.${student.studentId}` : undefined },
      { table: "results", filter: student?.studentId ? `student_id=eq.${student.studentId}` : undefined },
      { table: "notifications", filter: user?.userId ? `recipient_user_id=eq.${user.userId}` : undefined },
    ],
    [
      ["student-dashboard-exams"],
      ["student-dashboard-attempts"],
      ["student-dashboard-results"],
      ["student-dashboard-notifs"],
    ],
    Boolean(student?.studentId),
    2000,
  );

  const examsQ = useQuery({
    queryKey: ["student-dashboard-exams", student?.schoolId, student?.courseIds?.join(",")],
    enabled: Boolean(student?.schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("examinations")
        .select(
          "id, title, status, scheduled_start, scheduled_end, duration_minutes, course_id, courses(code, name)",
        )
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
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          "id, exam_id, percentage, grade, pass_fail, status, released_at, created_at, examinations(title, courses(code))",
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
    staleTime: 30_000,
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

  const DONE = ["submitted", "terminated", "flagged"];

  const written = (attemptsQ.data ?? []).filter((a) =>
    DONE.includes(String(a.status).toLowerCase()),
  ).length;

  const readyExams = exams.filter((e) => {
    const done = DONE.includes(String(attemptsByExam.get(e.id) || "").toLowerCase());
    if (done) return false;
    const avail = examAvailability(e.status, e.scheduled_start, e.scheduled_end);
    return avail === "available" || avail === "upcoming";
  });

  const readyNow = readyExams.filter(
    (e) => examAvailability(e.status, e.scheduled_start, e.scheduled_end) === "available",
  );

  const unreadNotifs = notifs.filter((n) => !n.read_at).length;
  const courseCount = student?.courses?.length ?? 0;

  if (sLoading) {
    return <p className="text-sm text-slate-500">Loading dashboard…</p>;
  }

  if (!student) {
    return (
      <EmptyState
        title="Student profile not found"
        description="Contact School Admin to link your account to a student record."
      />
    );
  }

  return (
    <>
      <PageHeader
        title={student.fullName ? `Welcome, ${student.fullName.split(" ")[0]}` : "Student dashboard"}
        description="Your examinations, results, courses and notifications."
      />

      {/* Student information — real DB fields */}
      <SectionCard title="Student information" className="mb-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <InfoCell icon={User} label="Full name" value={student.fullName || "—"} bold />
          <InfoCell icon={Hash} label="Matric number" value={student.matric || "—"} />
          <InfoCell icon={Building2} label="College / Faculty" value={student.facultyName || "—"} />
          <InfoCell icon={Building2} label="Department" value={student.departmentName || "—"} />
          <InfoCell icon={GraduationCap} label="Level" value={student.levelName || "—"} />
          <InfoCell
            icon={CalendarDays}
            label="Semester"
            value={
              [student.semesterName, student.sessionName].filter(Boolean).join(" · ") || "—"
            }
          />
        </div>
      </SectionCard>

      {/* Five clickable cards with real counts */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <DashCard
          to="/student/examinations"
          label="Ready exams"
          value={readyNow.length}
          hint={readyExams.length > readyNow.length ? `${readyExams.length} total eligible` : undefined}
          icon={ClipboardList}
          color="bg-blue-50 text-primary"
        />
        <DashCard
          to="/student/results"
          label="Results"
          value={results.length}
          icon={Trophy}
          color="bg-amber-50 text-amber-600"
        />
        <DashCard
          to="/student/history"
          label="Exam history"
          value={written}
          icon={History}
          color="bg-violet-50 text-violet-600"
        />
        <DashCard
          to="/student/courses"
          label="Courses"
          value={courseCount}
          icon={BookOpen}
          color="bg-emerald-50 text-emerald-600"
        />
        <DashCard
          to="/student/notifications"
          label="Notifications"
          value={unreadNotifs}
          hint={unreadNotifs ? "unread" : undefined}
          icon={Bell}
          color="bg-rose-50 text-rose-600"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Ready to start"
          description="Exams you are eligible to write now or soon"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/student/examinations">View All</Link>
            </Button>
          }
        >
          {readyExams.length === 0 ? (
            <EmptyState
              title="No ready exams"
              description="When officer-approved exams match your courses, they appear here."
            />
          ) : (
            <ul className="space-y-2">
              {readyExams.slice(0, 5).map((e) => {
                const avail = examAvailability(e.status, e.scheduled_start, e.scheduled_end);
                return (
                  <li key={e.id}>
                    <NavCard
                      to="/student/exam/$id"
                      params={{ id: e.id }}
                      ariaLabel={`Open ${e.title}`}
                      className="flex items-center justify-between gap-2 rounded-lg border-slate-100 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {e.courses?.code ? `${e.courses.code} · ` : ""}
                          {e.title}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-slate-500">
                          <CalendarDays className="h-3 w-3" />
                          {e.scheduled_start
                            ? new Date(e.scheduled_start).toLocaleString()
                            : "Schedule TBC"}
                          {e.duration_minutes ? ` · ${e.duration_minutes} min` : ""}
                        </p>
                      </div>
                      <StatusBadge status={avail === "available" ? "ready" : e.status} />
                    </NavCard>
                  </li>
                );
              })}
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
            <EmptyState
              title="No results yet"
              description="After you submit an exam, results appear here (scores show when released)."
            />
          ) : (
            <ul className="space-y-2">
              {results.slice(0, 5).map((r) => {
                const isPub =
                  (r.status || "").toLowerCase() === "published" || Boolean(r.released_at);
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
                          {r.examinations?.courses?.code
                            ? `${r.examinations.courses.code} · `
                            : ""}
                          {r.examinations?.title ?? "Exam"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {isPub
                            ? `${r.percentage != null ? `${Math.round(Number(r.percentage))}%` : "—"}${r.grade ? ` · ${r.grade}` : ""}`
                            : "Pending officer release"}
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

function InfoCell({
  icon: Icon,
  label,
  value,
  bold,
}: {
  icon: typeof User;
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className={cn("mt-0.5 truncate text-sm text-slate-900", bold && "font-bold")}>{value}</p>
    </div>
  );
}

function DashCard({
  to,
  label,
  value,
  hint,
  icon: Icon,
  color,
}: {
  to: string;
  label: string;
  value: number;
  hint?: string;
  icon: typeof Trophy;
  color: string;
}) {
  return (
    <NavCard to={to} ariaLabel={label} className="h-full">
      <div className="flex items-center gap-3">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-extrabold tabular-nums text-slate-900">{value}</p>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          {hint ? <p className="text-[10px] text-slate-400">{hint}</p> : null}
        </div>
        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" />
      </div>
    </NavCard>
  );
}
