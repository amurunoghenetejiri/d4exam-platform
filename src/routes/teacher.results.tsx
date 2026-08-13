import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/results")({
  head: () => ({
    meta: [
      { title: "Exam Analytics — D4EXAM" },
      { name: "description", content: "Performance analytics for completed examinations." },
    ],
  }),
  component: Page,
});

type ExamRow = {
  id: string;
  title: string;
  status: string;
  scheduled_end: string | null;
  courses: { code: string; name: string } | null;
};

type ResultRow = {
  id: string;
  exam_id: string;
  percentage: number | null;
  pass_fail: string | null;
  status: string;
};

type AttemptRow = { exam_id: string; status: string };

const PIE_COLORS = ["#10b981", "#ef4444", "#94a3b8"];

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const examsQ = useQuery({
    queryKey: ["teacher-completed-exams", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    queryFn: async () => {
      if (!teacher) return [] as ExamRow[];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, scheduled_end, courses(code, name)")
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds)
        .in("status", ["completed", "closed", "live", "approved", "scheduled"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  const examIds = (examsQ.data ?? []).map((e) => e.id);
  const activeId = selectedId ?? examIds[0] ?? null;

  const resultsQ = useQuery({
    queryKey: ["teacher-exam-results", activeId],
    enabled: Boolean(activeId && teacher?.schoolId),
    queryFn: async () => {
      if (!activeId || !teacher) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select("id, exam_id, percentage, pass_fail, status")
        .eq("school_id", teacher.schoolId)
        .eq("exam_id", activeId);
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["teacher-exam-attempts", activeId],
    enabled: Boolean(activeId && teacher?.schoolId),
    queryFn: async () => {
      if (!activeId || !teacher) return [] as AttemptRow[];
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("exam_id, status")
        .eq("school_id", teacher.schoolId)
        .eq("exam_id", activeId);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const analytics = useMemo(() => {
    const results = resultsQ.data ?? [];
    const attempts = attemptsQ.data ?? [];
    const wrote = attempts.filter((a) =>
      ["submitted", "terminated", "flagged", "in_progress"].includes((a.status || "").toLowerCase()),
    ).length;
    const registered = Math.max(wrote, results.length);
    const scores = results
      .map((r) => Number(r.percentage))
      .filter((n) => !Number.isNaN(n));
    const passed = results.filter((r) => (r.pass_fail || "").toLowerCase() === "pass").length;
    const failed = results.filter((r) => (r.pass_fail || "").toLowerCase() === "fail").length;
    const pending = results.length - passed - failed;
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const highest = scores.length ? Math.max(...scores) : null;
    const lowest = scores.length ? Math.min(...scores) : null;
    const passRate = results.length ? Math.round((passed / results.length) * 100) : null;

    const buckets = [
      { name: "0–39", count: 0 },
      { name: "40–49", count: 0 },
      { name: "50–59", count: 0 },
      { name: "60–69", count: 0 },
      { name: "70–79", count: 0 },
      { name: "80–100", count: 0 },
    ];
    for (const s of scores) {
      if (s < 40) buckets[0].count++;
      else if (s < 50) buckets[1].count++;
      else if (s < 60) buckets[2].count++;
      else if (s < 70) buckets[3].count++;
      else if (s < 80) buckets[4].count++;
      else buckets[5].count++;
    }

    const pie = [
      { name: "Passed", value: passed },
      { name: "Failed", value: failed },
      { name: "Pending", value: pending },
    ].filter((p) => p.value > 0);

    return {
      registered,
      wrote,
      passed,
      failed,
      avg,
      highest,
      lowest,
      passRate,
      buckets,
      pie,
      resultCount: results.length,
    };
  }, [resultsQ.data, attemptsQ.data]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return <EmptyState title="Teacher profile not found" description="Contact School Admin." />;
  }

  const rows = examsQ.data ?? [];
  const selected = rows.find((e) => e.id === activeId) ?? null;

  return (
    <>
      <PageHeader
        title="Exam Analytics"
        description={`Performance for exams on your courses · ${teacher.fullName}`}
      />

      <SectionCard title="Select examination">
        {examsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No examinations yet"
            description="When exams exist on your courses, analytics appear here."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  activeId === r.id
                    ? "border-primary bg-primary text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-primary/40",
                )}
              >
                {r.courses?.code ? `${r.courses.code} · ` : ""}
                {r.title}
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {selected && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold text-slate-900">{selected.title}</h2>
            <StatusBadge status={String(selected.status).replaceAll("_", " ")} />
            <span className="text-xs text-slate-500">
              {selected.courses?.code} — {selected.courses?.name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Registered / Wrote" value={`${analytics.registered} / ${analytics.wrote}`} />
            <Kpi label="Passed" value={String(analytics.passed)} />
            <Kpi label="Failed" value={String(analytics.failed)} />
            <Kpi label="Average" value={analytics.avg != null ? `${Math.round(analytics.avg)}%` : "—"} />
            <Kpi label="Highest" value={analytics.highest != null ? `${Math.round(analytics.highest)}%` : "—"} />
            <Kpi label="Lowest" value={analytics.lowest != null ? `${Math.round(analytics.lowest)}%` : "—"} />
            <Kpi label="Pass rate" value={analytics.passRate != null ? `${analytics.passRate}%` : "—"} />
          </div>

          {analytics.resultCount === 0 ? (
            <EmptyState
              title="No results yet"
              description="Analytics populate when students complete this exam and results are saved."
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard title="Pass / Fail" description="Class outcome split">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.pie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        label
                      >
                        {analytics.pie.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard title="Score distribution" description="How scores are spread">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.buckets}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} name="Students" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>

              <SectionCard
                title="Overall class performance"
                description="Score buckets (same distribution, wider view)"
                className="lg:col-span-2"
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.buckets}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0ea5e9" radius={[8, 8, 0, 0]} name="Students" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}
