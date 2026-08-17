import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";
import { shortDisplayName } from "@/lib/utils";

export const Route = createFileRoute("/teacher/live-exams")({
  head: () => ({
    meta: [{ title: "Live Exams — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();

  const examsQ = useQuery({
    queryKey: ["teacher-live", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    queryFn: async () => {
      if (!teacher) return [];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, scheduled_start, scheduled_end, courses(code, name)")
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds)
        .in("status", ["ongoing", "scheduled", "published", "approved"])
        .order("scheduled_start", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return <EmptyState title="Teacher profile not found" description="Contact School Admin." />;
  }

  const rows = examsQ.data ?? [];
  const live = rows.filter((e) => e.status === "ongoing");
  const upcoming = rows.filter((e) => e.status !== "ongoing");

  return (
    <>
      <PageHeader
        title="Live Exams"
        description={`Sessions on your assigned courses · ${shortDisplayName(teacher.fullName)}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Live now</p>
          <p className="mt-1 text-2xl font-extrabold">{live.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Upcoming / approved</p>
          <p className="mt-1 text-2xl font-extrabold">{upcoming.length}</p>
        </div>
      </div>

      <SectionCard title="In progress">
        {live.length === 0 ? (
          <EmptyState
            title="No live examinations"
            description="When an approved exam is ongoing on your courses, it appears here."
            icon={Radio}
          />
        ) : (
          <ul className="space-y-3">
            {live.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"
              >
                <div>
                  <p className="text-sm font-bold">{e.title}</p>
                  <p className="text-xs text-slate-500">{(e.courses as { code?: string } | null)?.code}</p>
                </div>
                <StatusBadge status="ongoing" />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard className="mt-6" title="Scheduled / approved">
        {upcoming.length === 0 ? (
          <EmptyState title="None scheduled" description="Approved exams on your courses will list here." />
        ) : (
          <ul className="space-y-2">
            {upcoming.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-bold">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {(e.courses as { code?: string } | null)?.code} ·{" "}
                    {e.scheduled_start
                      ? new Date(e.scheduled_start).toLocaleString()
                      : "Not scheduled"}
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
