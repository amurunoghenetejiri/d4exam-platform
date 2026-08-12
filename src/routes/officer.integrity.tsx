import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/officer/integrity")({
  head: () => ({
    meta: [{ title: "Integrity Review — D4EXAM" }],
  }),
  component: Page,
});

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;

  const eventsQ = useQuery({
    queryKey: ["officer-integrity", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [];
      try {
        const { data, error } = await supabase
          .from("integrity_events")
          .select("id, event_type, severity, description, created_at, exam_id")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  const events = eventsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Integrity Review"
        description={`${user?.fullName ?? "Officer"} · Events logged during student exam attempts`}
      />

      <SectionCard title="Integrity events">
        {eventsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : events.length === 0 ? (
          <EmptyState
            title="No integrity events"
            description="Tab switches, fullscreen exits and similar events appear here once students sit locked-down exams."
          />
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-slate-100 px-3 py-2.5 text-sm"
              >
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
