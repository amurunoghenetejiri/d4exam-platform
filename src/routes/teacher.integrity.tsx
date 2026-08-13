import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { useTeacherContext } from "@/lib/teacher";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/teacher/integrity")({
  head: () => ({
    meta: [
      { title: "Integrity — D4EXAM" },
      {
        name: "description",
        content: "Integrity events for examinations on your assigned courses.",
      },
    ],
  }),
  component: Page,
});

type EventRow = {
  id: string;
  event_type: string;
  severity: string;
  description: string | null;
  created_at: string;
  exam_id: string;
};

function Page() {
  const { data: teacher, isLoading } = useTeacherContext();

  const examsQ = useQuery({
    queryKey: ["teacher-integrity-exams", teacher?.schoolId, teacher?.courseIds],
    enabled: Boolean(teacher?.schoolId && teacher.courseIds.length),
    queryFn: async () => {
      if (!teacher) return [] as string[];
      const { data } = await supabase
        .from("examinations")
        .select("id")
        .eq("school_id", teacher.schoolId)
        .in("course_id", teacher.courseIds);
      return (data ?? []).map((e) => e.id as string);
    },
  });

  const eventsQ = useQuery({
    queryKey: ["teacher-integrity-events", teacher?.schoolId, examsQ.data?.join(",")],
    enabled: Boolean(teacher?.schoolId && (examsQ.data?.length ?? 0) > 0),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!teacher || !examsQ.data?.length) return [] as EventRow[];
      const { data, error } = await supabase
        .from("integrity_events")
        .select("id, event_type, severity, description, created_at, exam_id")
        .eq("school_id", teacher.schoolId)
        .in("exam_id", examsQ.data)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!teacher) {
    return <EmptyState title="Teacher profile not found" description="Contact School Admin." />;
  }

  const events = eventsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Integrity"
        description={`Security events for exams on your ${teacher.courses.length} assigned course(s) · ${teacher.fullName}`}
      />

      <SectionCard title="Integrity events">
        {eventsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : events.length === 0 ? (
          <EmptyState
            title="No integrity events yet"
            description="Tab switches, fullscreen exits, copy attempts, face presence and connection events appear here when students sit locked-down exams. Events inform review — they do not automatically prove cheating."
          />
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => (
              <li key={ev.id} className="rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
                <p className="font-bold text-slate-900">
                  {ev.event_type} · {ev.severity}
                </p>
                <p className="text-xs text-slate-500">
                  {ev.description || "—"} · {new Date(ev.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
