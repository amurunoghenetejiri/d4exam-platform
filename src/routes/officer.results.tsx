import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/officer/results")({
  head: () => ({ meta: [{ title: "Results Release — D4EXAM" }] }),
  component: Page,
});

type ExamRow = {
  id: string;
  title: string;
  status: string;
  course_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_minutes: number | null;
  courses: { code: string; name: string } | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();

  const examsQ = useQuery({
    queryKey: ["officer-results-exams", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [] as ExamRow[];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, course_id, scheduled_start, scheduled_end, duration_minutes, courses(code, name)")
        .eq("school_id", schoolId)
        .in("status", ["completed", "closed", "ongoing", "scheduled", "approved", "published"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["officer-exam-attempts", schoolId, examsQ.data?.map((e) => e.id).join(",")],
    enabled: Boolean(schoolId && (examsQ.data?.length ?? 0) > 0),
    queryFn: async () => {
      const ids = (examsQ.data ?? []).map((e) => e.id);
      if (!ids.length) return {} as Record<string, { total: number; finished: number }>;
      try {
        const { data, error } = await supabase.from("exam_attempts").select("exam_id, status").in("exam_id", ids);
        if (error) throw error;
        const map: Record<string, { total: number; finished: number }> = {};
        for (const a of data ?? []) {
          const eid = (a as { exam_id: string }).exam_id;
          if (!map[eid]) map[eid] = { total: 0, finished: 0 };
          map[eid].total += 1;
          const st = String((a as { status: string }).status || "").toLowerCase();
          if (["submitted", "completed", "finished", "graded", "marked", "terminated"].includes(st)) map[eid].finished += 1;
        }
        return map;
      } catch {
        return {} as Record<string, { total: number; finished: number }>;
      }
    },
  });

  async function markCompleted(id: string) {
    if (!schoolId || !user) return;
    const stats = attemptsQ.data?.[id];
    if (stats && stats.total > 0 && stats.finished < stats.total) {
      toast.error(`Cannot complete yet — ${stats.finished} of ${stats.total} student attempts finished.`);
      return;
    }
    const { error } = await supabase.from("examinations").update({ status: "completed" } as never).eq("id", id).eq("school_id", schoolId);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Marked completed");
    await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
  }

  async function releaseResults(examId: string) {
    if (!schoolId || !user) return;
    if (!confirm("Release results to students? Flagged attempts stay under review.")) return;
    const { data, error } = await supabase.from("results").update({
      status: "published", released_at: new Date().toISOString(), released_by: user.userId,
    } as never).eq("exam_id", examId).eq("school_id", schoolId).neq("security_review_status", "flagged").select("id");
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Released ${data?.length ?? 0} result(s)`);
    await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
  }

  async function holdAllResults(examId: string) {
    if (!schoolId || !user) return;
    if (!confirm("Hold all results? Students will not see scores until released.")) return;
    const { error } = await supabase.from("results").update({ status: "pending", released_at: null } as never).eq("exam_id", examId).eq("school_id", schoolId);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Results held for review");
  }

  async function rescheduleExam(examId: string) {
    if (!schoolId || !user) return;
    const startStr = window.prompt("New start (YYYY-MM-DDTHH:MM)", "");
    if (!startStr) return;
    const endStr = window.prompt("New end (YYYY-MM-DDTHH:MM)", "");
    if (!endStr) return;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      toast.error("Invalid schedule"); return;
    }
    const { error } = await supabase.from("examinations").update({
      scheduled_start: start.toISOString(), scheduled_end: end.toISOString(), status: "scheduled",
    } as never).eq("id", examId).eq("school_id", schoolId);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Exam rescheduled");
    await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
  }

  async function allowRewrite(examId: string) {
    if (!schoolId || !user) return;
    const matric = window.prompt("Student matric to allow rewrite:");
    if (!matric?.trim()) return;
    const { data: st } = await supabase.from("students").select("id").eq("school_id", schoolId).ilike("matric_number", matric.trim()).maybeSingle();
    if (!st?.id) { toast.error("Student not found"); return; }
    if (!confirm(`Clear attempt for ${matric.trim()}?`)) return;
    await supabase.from("exam_attempts").delete().eq("exam_id", examId).eq("student_id", st.id as string);
    await supabase.from("results").delete().eq("exam_id", examId).eq("student_id", st.id as string);
    toast.success("Attempt cleared — student can rewrite");
    await qc.invalidateQueries({ queryKey: ["officer-exam-attempts"] });
  }

  const rows = examsQ.data ?? [];
  const attempts = attemptsQ.data ?? {};

  return (
    <>
      <PageHeader title="Results Release" description="Mark completed, release or hold results, reschedule, or allow rewrite." />
      <SectionCard title="Examinations">
        {examsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No exams yet" description="Approved and completed examinations appear here." />
        ) : (
          <ul className="space-y-3">
            {rows.map((e) => {
              const st = attempts[e.id];
              const blocked = st && st.total > 0 && st.finished < st.total && e.status !== "completed";
              return (
                <li key={e.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{e.title}</p>
                    <p className="text-xs text-slate-500">{e.courses?.code} — {e.courses?.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {e.scheduled_start ? `Start ${new Date(e.scheduled_start).toLocaleString()}` : "Not scheduled"}
                      {e.duration_minutes ? ` · ${e.duration_minutes} min` : ""}
                      {st ? ` · Attempts ${st.finished}/${st.total} finished` : " · No attempts yet"}
                    </p>
                    {blocked && <p className="mt-1 text-xs font-semibold text-amber-700">Waiting for remaining students to finish.</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={String(e.status).replaceAll("_", " ")} />
                    {e.status !== "completed" && e.status !== "closed" && (
                      <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={Boolean(blocked)} onClick={() => void markCompleted(e.id)}>Complete</Button>
                    )}
                    <Button size="sm" className="h-8 px-2.5 text-xs font-semibold" onClick={() => void releaseResults(e.id)}>Release</Button>
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => void holdAllResults(e.id)}>Hold</Button>
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => void rescheduleExam(e.id)}>Reschedule</Button>
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => void allowRewrite(e.id)}>Rewrite</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
