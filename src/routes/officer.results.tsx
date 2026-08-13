import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/officer/results")({
  head: () => ({
    meta: [{ title: "Results Release — D4EXAM" }],
  }),
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
        .select(
          "id, title, status, course_id, scheduled_start, scheduled_end, duration_minutes, courses(code, name)",
        )
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
        const { data, error } = await supabase
          .from("exam_attempts")
          .select("exam_id, status")
          .in("exam_id", ids);
        if (error) throw error;
        const map: Record<string, { total: number; finished: number }> = {};
        for (const a of data ?? []) {
          const eid = (a as { exam_id: string }).exam_id;
          if (!map[eid]) map[eid] = { total: 0, finished: 0 };
          map[eid].total += 1;
          const st = String((a as { status: string }).status || "").toLowerCase();
          if (["submitted", "completed", "finished", "graded", "marked", "terminated"].includes(st)) {
            map[eid].finished += 1;
          }
        }
        return map;
      } catch {
        return {} as Record<string, { total: number; finished: number }>;
      }
    },
  });

  const qCountQ = useQuery({
    queryKey: ["officer-exam-qcounts", schoolId, examsQ.data?.map((e) => e.course_id).join(",")],
    enabled: Boolean(schoolId && (examsQ.data?.length ?? 0) > 0),
    queryFn: async () => {
      const courseIds = [...new Set((examsQ.data ?? []).map((e) => e.course_id).filter(Boolean))] as string[];
      if (!courseIds.length || !schoolId) return {} as Record<string, number>;
      const { data } = await supabase
        .from("questions")
        .select("course_id")
        .eq("school_id", schoolId)
        .in("course_id", courseIds);
      const map: Record<string, number> = {};
      for (const q of data ?? []) {
        const c = (q as { course_id: string }).course_id;
        map[c] = (map[c] ?? 0) + 1;
      }
      return map;
    },
  });

  async function markCompleted(id: string) {
    if (!schoolId || !user) return;
    const stats = attemptsQ.data?.[id];
    if (stats && stats.total > 0 && stats.finished < stats.total) {
      toast.error(
        `Cannot complete yet — ${stats.finished} of ${stats.total} student attempts finished. All students must finish first.`,
      );
      return;
    }
    if (!stats || stats.total === 0) {
      if (
        !confirm(
          "No student attempts recorded yet. Mark completed only if you are sure all candidates have finished.",
        )
      ) {
        return;
      }
    }

    const { error } = await supabase
      .from("examinations")
      .update({ status: "completed" } as never)
      .eq("id", id)
      .eq("school_id", schoolId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: user.userId,
      actor_role: "examination_officer",
      action: "exam_completed",
      entity_type: "examination",
      entity_id: id,
      description: "Marked examination completed after student attempts finished",
    } as never);
    toast.success("Marked completed");
    await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
    await examsQ.refetch();
  }

  async function releaseResults(examId: string) {
    if (!schoolId || !user) return;
    if (
      !confirm(
        "Release all pending results for this examination to students and teachers? Flagged attempts stay under review until you clear them.",
      )
    ) {
      return;
    }
    const { data, error } = await supabase
      .from("results")
      .update({
        status: "published",
        released_at: new Date().toISOString(),
        released_by: user.userId,
      } as never)
      .eq("exam_id", examId)
      .eq("school_id", schoolId)
      .neq("security_review_status", "flagged")
      .select("id");
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("audit_logs").insert({
      school_id: schoolId,
      actor_user_id: user.userId,
      actor_role: "examination_officer",
      action: "results_released",
      entity_type: "examination",
      entity_id: examId,
      description: `Released ${data?.length ?? 0} result(s) to students and teachers`,
    } as never);
    toast.success(`Released ${data?.length ?? 0} result(s)`);
    await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
  }

  const rows = examsQ.data ?? [];
  const attempts = attemptsQ.data ?? {};
  const qCounts = qCountQ.data ?? {};

  return (
    <>
      <PageHeader
        title="Results Release"
        description="Mark exams completed when attempts finish. Release results so students and teachers can see official scores. Flagged attempts stay under review."
      />

      <SectionCard title="Examinations">
        {examsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No exams yet"
            description="Approved and completed examinations will appear here."
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((e) => {
              const st = attempts[e.id];
              const blocked =
                st && st.total > 0 && st.finished < st.total && e.status !== "completed";
              const qn = e.course_id ? qCounts[e.course_id] ?? 0 : 0;
              return (
                <li
                  key={e.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.courses?.code} — {e.courses?.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {e.scheduled_start
                        ? `Start ${new Date(e.scheduled_start).toLocaleString()}`
                        : "Not scheduled"}
                      {e.duration_minutes ? ` · ${e.duration_minutes} min` : ""}
                      {qn ? ` · ${qn} bank questions` : ""}
                      {st
                        ? ` · Attempts ${st.finished}/${st.total} finished`
                        : " · No attempts yet"}
                    </p>
                    {blocked && (
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Waiting for remaining students to finish before completion.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={String(e.status).replaceAll("_", " ")} />
                    {e.status !== "completed" && e.status !== "closed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={Boolean(blocked)}
                        onClick={() => void markCompleted(e.id)}
                      >
                        Mark completed
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="font-semibold"
                      onClick={() => void releaseResults(e.id)}
                    >
                      Release results
                    </Button>
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
