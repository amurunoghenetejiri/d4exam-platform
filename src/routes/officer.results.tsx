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

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();

  const examsQ = useQuery({
    queryKey: ["officer-results-exams", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, courses(code, name)")
        .eq("school_id", schoolId)
        .in("status", ["completed", "closed", "ongoing", "scheduled", "approved"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function markCompleted(id: string) {
    if (!schoolId || !user) return;
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
      description: "Marked examination completed",
    } as never);
    toast.success("Marked completed");
    await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
    await examsQ.refetch();
  }

  const rows = examsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Results Release"
        description="Manage completed examinations for your school. Detailed student scores appear when attempts exist."
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
            {rows.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
              >
                <div>
                  <p className="text-sm font-bold">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {(e.courses as { code?: string } | null)?.code} —{" "}
                    {(e.courses as { name?: string } | null)?.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={String(e.status).replaceAll("_", " ")} />
                  {e.status !== "completed" && e.status !== "closed" && (
                    <Button size="sm" variant="outline" onClick={() => void markCompleted(e.id)}>
                      Mark completed
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
