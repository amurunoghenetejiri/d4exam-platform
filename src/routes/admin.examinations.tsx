import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/examinations")({
  head: () => ({ meta: [{ title: "Examinations — D4EXAM" }] }),
  component: Page,
});

type Exam = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  scheduled_start: string | null;
  courses: { code: string; name: string } | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;

  const listQ = useQuery({
    queryKey: ["admin-exams-view", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [] as Exam[];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, duration_minutes, scheduled_start, courses(code, name)")
        .eq("school_id", schoolId)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Exam[];
    },
  });

  const exams = listQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Examinations"
        description="School overview. Only teachers create examinations; drafts stay private to the teacher until submitted."
        actions={
          <Button variant="outline" className="font-semibold" asChild>
            <Link to="/admin/teachers">Teachers</Link>
          </Button>
        }
      />

      <SectionCard title="Submitted & approved examinations">
        {listQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : exams.length === 0 ? (
          <EmptyState
            title="No submitted examinations"
            description="When a teacher submits an exam for officer approval, it appears here (not drafts)."
          />
        ) : (
          <ul className="space-y-3">
            {exams.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {e.courses?.code ?? "—"} · {e.duration_minutes} min
                    {e.scheduled_start
                      ? ` · ${new Date(e.scheduled_start).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={String(e.status).replaceAll("_", " ")} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
