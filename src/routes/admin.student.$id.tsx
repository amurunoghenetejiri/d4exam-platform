import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Phone,
  Copy,
  Building2,
  GraduationCap,
  Layers,
  Calendar,
  Loader2,
  User,
  BookOpen,
  FileText,
  Trophy,
  Percent,
  Target,
  Eye,
  MapPin,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/student/$id")({
  head: () => ({
    meta: [{ title: "Student Profile — D4EXAM" }],
  }),
  component: Page,
});

const DIST_COLORS = ["#2563eb", "#10b981", "#0ea5e9", "#f59e0b", "#ef4444"];

function Page() {
  const { id } = Route.useParams();
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;

  useRealtimeInvalidate(
    `admin-student-${id}`,
    [
      { table: "students" },
      { table: "results" },
      { table: "student_courses" },
      { table: "courses" },
      { table: "exam_attempts" },
    ],
    [
      ["admin-student-profile", id],
      ["admin-student-results", id],
      ["admin-student-courses", id],
      ["admin-student-eligible", id],
      ["admin-student-attempts", id],
    ],
    Boolean(id && schoolId),
  );

  const studentQ = useQuery({
    queryKey: ["admin-student-profile", id, schoolId],
    enabled: Boolean(id && schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          `id, student_id, matric_number, full_name, status, admission_number,
           profile_photo_url, profile_id, created_at, updated_at,
           faculty_id, department_id, level_id, academic_session_id, school_id,
           faculties(name, code),
           departments(name, code),
           levels(name, code),
           academic_sessions(name, status),
           schools(name, school_code),
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
             faculty_id, department_id, level_id, academic_session_id, school_id,
             faculties(name, code),
             departments(name, code),
             levels(name, code),
             schools(name, school_code),
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

  const resultsQ = useQuery({
    queryKey: ["admin-student-results", id, schoolId],
    enabled: Boolean(id && schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("results")
        .select(
          `id, exam_id, percentage, grade, pass_fail, status, total_score,
           correct_count, wrong_count, unanswered_count, created_at, released_at,
           examinations(title, duration_minutes, courses(code, name))`,
        )
        .eq("student_id", id)
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const enrolledQ = useQuery({
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

  // Eligible courses from structure: same school + department + level
  const eligibleQ = useQuery({
    queryKey: [
      "admin-student-eligible",
      id,
      schoolId,
      studentQ.data?.department_id,
      studentQ.data?.level_id,
    ],
    enabled: Boolean(
      schoolId && (studentQ.data?.department_id || studentQ.data?.level_id),
    ),
    queryFn: async () => {
      let q = supabase
        .from("courses")
        .select("id, code, name, credit_units, status, department_id, level_id")
        .eq("school_id", schoolId!)
        .eq("status", "active")
        .order("code")
        .limit(100);

      if (studentQ.data?.department_id) {
        q = q.eq("department_id", studentQ.data.department_id);
      }
      if (studentQ.data?.level_id) {
        q = q.eq("level_id", studentQ.data.level_id);
      }

      const { data, error } = await q;
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
  const matric = s?.matric_number || s?.student_id || "—";
  const studentId = s?.student_id || "—";

  const college = (s?.faculties as { name?: string } | null)?.name || "—";
  const department = (s?.departments as { name?: string } | null)?.name || "—";
  const level = (s?.levels as { name?: string } | null)?.name || "—";
  const session =
    (s as { academic_sessions?: { name?: string } | null } | null)?.academic_sessions?.name ||
    "—";
  const schoolName =
    (s as { schools?: { name?: string; school_code?: string } | null } | null)?.schools?.name ||
    user?.schoolName ||
    "—";

  const results = resultsQ.data ?? [];
  const published = results.filter((r) => String(r.status || "").toLowerCase() === "published");
  const pending = results.filter((r) => String(r.status || "").toLowerCase() !== "published");
  const scores = published
    .map((r) => Number(r.percentage))
    .filter((n) => !Number.isNaN(n));
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const highest = scores.length ? Math.round(Math.max(...scores)) : null;
  const passed = published.filter((r) => String(r.pass_fail || "").toLowerCase() === "pass").length;
  const failed = published.filter((r) => String(r.pass_fail || "").toLowerCase() === "fail").length;
  const passRate =
    published.length > 0 ? Math.round((passed / published.length) * 100) : null;

  const performanceLine = useMemo(() => {
    return published
      .slice()
      .reverse()
      .map((r) => {
        const exam = r.examinations as {
          title?: string;
          courses?: { code?: string } | null;
        } | null;
        const code = exam?.courses?.code || exam?.title?.slice(0, 8) || "Exam";
        return {
          label: code,
          date: r.created_at
            ? new Date(r.created_at as string).toLocaleDateString(undefined, {
                month: "numeric",
                day: "numeric",
                year: "2-digit",
              })
            : "",
          score: Number(r.percentage ?? 0),
        };
      });
  }, [published]);

  const scoreDist = useMemo(() => {
    const buckets = [
      { name: "90 – 100%", min: 90, max: 101, value: 0, color: DIST_COLORS[0] },
      { name: "80 – 89%", min: 80, max: 90, value: 0, color: DIST_COLORS[1] },
      { name: "70 – 79%", min: 70, max: 80, value: 0, color: DIST_COLORS[2] },
      { name: "50 – 69%", min: 50, max: 70, value: 0, color: DIST_COLORS[3] },
      { name: "0 – 49%", min: 0, max: 50, value: 0, color: DIST_COLORS[4] },
    ];
    for (const s of scores) {
      const b = buckets.find((x) => s >= x.min && s < x.max);
      if (b) b.value++;
    }
    const total = scores.length || 1;
    return buckets
      .filter((b) => b.value > 0)
      .map((b) => ({ ...b, pct: Math.round((b.value / total) * 100) }));
  }, [scores]);

  // Prefer enrolled courses; if none, show eligible structure courses
  const enrolled = enrolledQ.data ?? [];
  const eligible = eligibleQ.data ?? [];
  const courseList =
    enrolled.length > 0
      ? enrolled.map((c) => {
          const course = (c as { courses?: { code?: string; name?: string; credit_units?: number } | null })
            .courses;
          return {
            id: c.id as string,
            code: course?.code ?? "—",
            name: course?.name ?? "",
            units: course?.credit_units,
            source: "enrolled" as const,
          };
        })
      : eligible.map((c) => ({
          id: c.id as string,
          code: (c.code as string) ?? "—",
          name: (c.name as string) ?? "",
          units: c.credit_units as number | undefined,
          source: "eligible" as const,
        }));

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  function copyText(text: string, label: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  }

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

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link to="/admin/students" className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Students
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-800">Student Profile</span>
      </div>

      {/* Hero header */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1b3a] via-[#123056] to-primary shadow-lg">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            {photo ? (
              <img
                src={photo}
                alt={name}
                className="h-20 w-20 shrink-0 rounded-full border-4 border-white/20 object-cover sm:h-24 sm:w-24"
              />
            ) : (
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-white/20 bg-white/10 text-2xl font-extrabold text-white sm:h-24 sm:w-24 sm:text-3xl">
                {initials || <User className="h-8 w-8" />}
              </div>
            )}
            <div className="min-w-0 text-white">
              <div className="mb-1.5">
                <StatusBadge
                  status={s.status}
                  className="border-white/30 bg-white/15 text-white"
                />
              </div>
              <h1 className="text-lg font-extrabold leading-tight sm:text-2xl">{name}</h1>
              <p className="mt-1 text-sm font-semibold text-white/80">{matric}</p>
              <div className="mt-2 flex flex-col gap-1 text-xs text-white/70 sm:text-sm">
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {email || "Not set"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {phone || "Not set"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 rounded-xl bg-white/10 px-4 py-3 text-white backdrop-blur-sm sm:min-w-[200px]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  Student ID
                </p>
                <p className="text-sm font-bold">{studentId}</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 hover:bg-white/10"
                onClick={() => copyText(studentId, "Student ID")}
                aria-label="Copy student ID"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="border-t border-white/10 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                Registered
              </p>
              <p className="text-sm font-bold">
                {s.created_at
                  ? new Date(s.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Academic structure pills */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StructPill icon={Building2} label="College" value={college} />
        <StructPill icon={Layers} label="Department" value={department} />
        <StructPill icon={GraduationCap} label="Level" value={level} />
        <StructPill icon={Calendar} label="Session" value={session} />
      </div>

      {/* Academic Overview KPIs */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 text-sm font-bold text-slate-900 sm:text-base">Academic Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MiniKpi icon={FileText} label="Exams Written" value={String(results.length)} tone="bg-blue-50 text-blue-600" />
          <MiniKpi icon={Trophy} label="Passed" value={String(passed)} tone="bg-emerald-50 text-emerald-600" />
          <MiniKpi icon={FileText} label="Failed" value={String(failed)} tone="bg-red-50 text-red-600" />
          <MiniKpi icon={Percent} label="Average Score" value={avg != null ? `${avg}%` : "—"} tone="bg-violet-50 text-violet-600" />
          <MiniKpi icon={Target} label="Highest Score" value={highest != null ? `${highest}%` : "—"} tone="bg-amber-50 text-amber-600" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniKpi icon={ClockIcon} label="Pending Results" value={String(pending.length)} tone="bg-orange-50 text-orange-600" />
          <MiniKpi icon={Percent} label="Pass Rate" value={passRate != null ? `${passRate}%` : "—"} tone="bg-sky-50 text-sky-600" />
          <MiniKpi icon={Building2} label="School" value={schoolName} tone="bg-slate-50 text-slate-600" />
        </div>
      </section>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">Performance Over Time</h2>
            <p className="text-xs text-slate-500">Published exam scores over time</p>
          </div>
          {performanceLine.length === 0 ? (
            <EmptyState title="No published scores" description="Charts appear when results are released." />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceLine}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, "Score"]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as { label?: string; date?: string } | undefined;
                      return p ? `${p.label}${p.date ? ` · ${p.date}` : ""}` : "";
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#2563eb" }}
                    name="Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-slate-900">Score Distribution</h2>
            <p className="text-xs text-slate-500">Overall score range distribution</p>
          </div>
          {scoreDist.length === 0 ? (
            <EmptyState title="No distribution yet" description="Published results feed this chart." />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={scoreDist}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={2}
                    >
                      {scoreDist.map((e, i) => (
                        <Cell key={i} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-lg font-extrabold text-slate-900">{published.length}</p>
                  <p className="text-[10px] font-semibold text-slate-400">Exams</p>
                </div>
              </div>
              <ul className="w-full space-y-1.5 text-sm">
                {scoreDist.map((b) => (
                  <li key={b.name} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                      {b.name}
                    </span>
                    <span className="font-semibold text-slate-900">{b.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Contact / bio grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InfoTile icon={Mail} label="Email" value={email || "Not set"} />
        <InfoTile icon={Phone} label="Phone" value={phone || "Not set"} />
        <InfoTile icon={User} label="Matric" value={matric} />
        <InfoTile icon={MapPin} label="School" value={schoolName} />
      </div>

      {/* Courses */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            {enrolled.length > 0 ? "Courses Enrolled" : "Eligible Courses"} ({courseList.length})
          </h2>
          {enrolled.length === 0 && eligible.length > 0 && (
            <span className="text-[11px] font-medium text-slate-400">
              From {department} · {level}
            </span>
          )}
        </div>
        {courseList.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description={
              enrolled.length === 0 && !studentQ.data?.department_id
                ? "Assign a department and level so eligible courses can be resolved."
                : "No courses match this student's department and level."
            }
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {courseList.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{c.code}</p>
                  <p className="truncate text-xs text-slate-500">{c.name}</p>
                </div>
                {c.units != null && (
                  <span className="shrink-0 text-xs font-semibold text-primary">{c.units} units</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Exam history */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Exam History ({results.length})</h2>
        </div>
        {resultsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : results.length === 0 ? (
          <EmptyState
            title="No exams written"
            description="Completed examinations appear here automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-2 font-semibold">Exam</th>
                  <th className="pb-2 pr-2 font-semibold">Date</th>
                  <th className="pb-2 pr-2 font-semibold">Score</th>
                  <th className="pb-2 pr-2 font-semibold">Grade</th>
                  <th className="pb-2 pr-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const exam = r.examinations as {
                    title?: string;
                    courses?: { code?: string } | null;
                  } | null;
                  const isPub = String(r.status || "").toLowerCase() === "published";
                  return (
                    <tr key={r.id as string} className="border-b border-slate-50">
                      <td className="py-2.5 pr-2 font-semibold text-slate-900">
                        {exam?.courses?.code ? `${exam.courses.code} – ` : ""}
                        {exam?.title ?? "Exam"}
                      </td>
                      <td className="py-2.5 pr-2 text-xs text-slate-500">
                        {r.created_at
                          ? new Date(r.created_at as string).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-2 font-bold">
                        {isPub && r.percentage != null
                          ? `${Math.round(Number(r.percentage))}%`
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-2">{isPub ? (r.grade as string) || "—" : "—"}</td>
                      <td className="py-2.5 pr-2">
                        <StatusBadge
                          status={isPub ? (r.pass_fail as string) || "published" : (r.status as string)}
                        />
                      </td>
                      <td className="py-2.5">
                        {isPub ? (
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                            <Link to="/admin/results" search={{ student: id, result: r.id as string }}>
                              <Eye className="h-4 w-4 text-primary" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ClockIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function StructPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function MiniKpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof FileText | typeof ClockIcon;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex items-center gap-2">
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-slate-500">{label}</p>
          <p className="truncate text-lg font-extrabold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
