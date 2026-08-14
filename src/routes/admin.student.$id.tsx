import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Phone,
  Hash,
  Building2,
  GraduationCap,
  BookOpen,
  FileText,
  Trophy,
  Percent,
  Loader2,
  User,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/student/$id")({
  head: () => ({
    meta: [{ title: "Student Profile — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;

  const studentQ = useQuery({
    queryKey: ["admin-student-profile", id, schoolId],
    enabled: Boolean(id && schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          `id, student_id, matric_number, full_name, status, admission_number,
           profile_photo_url, profile_id, created_at, updated_at,
           faculty_id, department_id, level_id, academic_session_id,
           faculties(name, code),
           departments(name, code),
           levels(name, code),
           academic_sessions(name),
           profiles(full_name, email, phone, profile_photo_url, first_name, last_name, middle_name, status)`,
        )
        .eq("id", id)
        .eq("school_id", schoolId!)
        .maybeSingle();

      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("students")
          .select(
            `id, student_id, matric_number, full_name, status, admission_number,
             profile_photo_url, profile_id, created_at,
             faculty_id, department_id, level_id,
             faculties(name, code),
             departments(name, code),
             levels(name, code),
             profiles(full_name, email, phone, profile_photo_url)`,
          )
          .eq("id", id)
          .eq("school_id", schoolId!)
          .maybeSingle();
        if (e2) throw e2;
        return d2;
      }
      return data;
    },
  });

  const coursesQ = useQuery({
    queryKey: ["admin-student-courses", id, schoolId],
    enabled: Boolean(id && schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_courses")
        .select("id, status, courses(id, code, name, credit_units)")
        .eq("student_id", id)
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resultsQ = useQuery({
    queryKey: ["admin-student-results", id, schoolId],
    enabled: Boolean(id && schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          `id, exam_id, percentage, grade, pass_fail, status, total_score,
           correct_count, wrong_count, unanswered_count, created_at,
           examinations(title, duration_minutes, courses(code, name))`,
        )
        .eq("student_id", id)
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["admin-student-attempts", id, schoolId],
    enabled: Boolean(id && schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, status, started_at, submitted_at, tab_switch_count")
        .eq("student_id", id)
        .eq("school_id", schoolId!)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const s = studentQ.data;
  const profile = s?.profiles as {
    full_name?: string;
    email?: string;
    phone?: string | null;
    profile_photo_url?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    middle_name?: string | null;
  } | null;

  const name =
    (s?.full_name || profile?.full_name || "").trim() ||
    [profile?.first_name, profile?.middle_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Student";

  const photo =
    (s as { profile_photo_url?: string | null } | null)?.profile_photo_url ||
    profile?.profile_photo_url ||
    null;

  const email = profile?.email || null;
  const phone = profile?.phone || null;

  const results = resultsQ.data ?? [];
  const published = results.filter((r) => (r.status || "").toLowerCase() === "published");
  const scores = published
    .map((r) => Number(r.percentage))
    .filter((n) => !Number.isNaN(n));
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const passed = published.filter((r) => (r.pass_fail || "").toLowerCase() === "pass").length;
  const failed = published.filter((r) => (r.pass_fail || "").toLowerCase() === "fail").length;

  const chartData = useMemo(() => {
    return published
      .slice()
      .reverse()
      .map((r, i) => ({
        name:
          ((r as { examinations?: { courses?: { code?: string } | null; title?: string } | null })
            .examinations?.courses?.code ||
            (r as { examinations?: { title?: string } | null }).examinations?.title ||
            `E${i + 1}`
          ).slice(0, 10),
        score: Number(r.percentage ?? 0),
      }));
  }, [published]);

  if (studentQ.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading student profile…
      </div>
    );
  }

  if (!s) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="font-bold text-slate-900">Student not found</p>
        <p className="mt-1 text-sm text-slate-500">
          This student is not in your school, or the record was removed.
        </p>
        <Button className="mt-4" asChild>
          <Link to="/admin/students">Back to students</Link>
        </Button>
      </div>
    );
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <div className="mb-4">
        <Button variant="outline" size="sm" className="font-semibold" asChild>
          <Link to="/admin/students">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Students
          </Link>
        </Button>
      </div>

      {/* Hero card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-20 bg-gradient-to-r from-[#0b1b3a] to-primary/80 sm:h-24" />
        <div className="relative px-4 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              {photo ? (
                <img
                  src={photo}
                  alt={name}
                  className="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-md sm:h-24 sm:w-24"
                />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-2xl border-4 border-white bg-primary/10 text-xl font-extrabold text-primary shadow-md sm:h-24 sm:w-24 sm:text-2xl">
                  {initials || <User className="h-8 w-8" />}
                </div>
              )}
              <div className="min-w-0 pb-1">
                <h1 className="truncate text-xl font-extrabold text-slate-900 sm:text-2xl">{name}</h1>
                <p className="mt-0.5 text-sm font-semibold text-slate-600">
                  {s.matric_number || s.student_id}
                </p>
                <div className="mt-1.5">
                  <StatusBadge status={s.status} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoPill icon={Building2} label="College" value={(s.faculties as { name?: string } | null)?.name || "—"} />
            <InfoPill icon={Building2} label="Department" value={(s.departments as { name?: string } | null)?.name || "—"} />
            <InfoPill icon={GraduationCap} label="Level" value={(s.levels as { name?: string } | null)?.name || "—"} />
            <InfoPill
              icon={BookOpen}
              label="Session"
              value={(s as { academic_sessions?: { name?: string } | null }).academic_sessions?.name || "—"}
            />
          </div>
        </div>
      </div>

      {/* Contact + IDs */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaCard icon={Hash} label="Matric number" value={s.matric_number || "—"} />
        <MetaCard icon={Hash} label="Student ID" value={s.student_id || "—"} />
        <MetaCard icon={Mail} label="Email" value={email || "Not set"} />
        <MetaCard icon={Phone} label="Phone" value={phone || "Not set"} />
      </div>

      {(s.admission_number || s.created_at) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {s.admission_number && (
            <MetaCard icon={Hash} label="Admission number" value={s.admission_number} />
          )}
          {s.created_at && (
            <MetaCard
              icon={FileText}
              label="Registered"
              value={new Date(s.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
            />
          )}
        </div>
      )}

      {/* Performance KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Exams written" value={String(results.length)} icon={FileText} />
        <Kpi label="Average score" value={avg != null ? `${avg}%` : "—"} icon={Percent} />
        <Kpi label="Passed" value={String(passed)} icon={Trophy} tone="green" />
        <Kpi label="Failed" value={String(failed)} icon={FileText} tone="red" />
      </div>

      {/* Performance graph */}
      <SectionCard className="mt-6" title="Performance" description="Published exam scores over time">
        {chartData.length === 0 ? (
          <EmptyState title="No published scores yet" description="Graphs appear when results are released." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="score" fill="#2563eb" radius={[6, 6, 0, 0]} name="Score %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title={`Courses (${(coursesQ.data ?? []).length})`}>
          {coursesQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (coursesQ.data ?? []).length === 0 ? (
            <EmptyState title="No courses" description="No course enrolments for this student." />
          ) : (
            <ul className="space-y-2">
              {(coursesQ.data ?? []).map((c) => {
                const course = (c as { courses?: { code?: string; name?: string; credit_units?: number } | null })
                  .courses;
                return (
                  <li
                    key={c.id as string}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{course?.code ?? "—"}</p>
                      <p className="truncate text-xs text-slate-500">{course?.name ?? ""}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      {course?.credit_units != null ? `${course.credit_units} units` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={`Exam history (${results.length})`}>
          {resultsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : results.length === 0 ? (
            <EmptyState title="No exams written" description="Results appear after the student sits exams." />
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {results.map((r) => {
                const exam = r.examinations as {
                  title?: string;
                  courses?: { code?: string } | null;
                } | null;
                const isPub = (r.status || "").toLowerCase() === "published";
                return (
                  <li
                    key={r.id as string}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {exam?.courses?.code ? `${exam.courses.code} · ` : ""}
                        {exam?.title ?? "Exam"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {r.created_at
                          ? new Date(r.created_at as string).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900">
                        {isPub && r.percentage != null
                          ? `${Math.round(Number(r.percentage))}%`
                          : "—"}
                      </span>
                      <StatusBadge
                        status={isPub ? (r.pass_fail as string) || "published" : (r.status as string)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {(attemptsQ.data ?? []).length > 0 && (
        <SectionCard className="mt-6" title="Attempts" description="Raw attempt records">
          <ul className="space-y-2">
            {(attemptsQ.data ?? []).slice(0, 12).map((a) => (
              <li
                key={a.id as string}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold capitalize text-slate-800">
                  {String(a.status).replaceAll("_", " ")}
                </span>
                <span className="text-xs text-slate-500">
                  {a.submitted_at
                    ? new Date(a.submitted_at as string).toLocaleString()
                    : a.started_at
                      ? new Date(a.started_at as string).toLocaleString()
                      : "—"}
                  {a.tab_switch_count != null ? ` · tabs ${a.tab_switch_count}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  );
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function MetaCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  icon: typeof FileText;
  tone?: "blue" | "green" | "red";
}) {
  const tones = {
    blue: "bg-blue-50 text-primary",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
