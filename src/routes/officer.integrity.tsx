import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/officer/integrity")({
  head: () => ({
    meta: [{ title: "Security Review — D4EXAM" }],
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
  student_id: string | null;
  attempt_id: string | null;
  metadata: Record<string, unknown> | null;
};

type AttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  tab_switch_count: number;
  fullscreen_exit_count: number | null;
  total_score: number | null;
  security_review_status: string | null;
  submitted_at: string | null;
  examinations: { title: string } | null;
  students: { matric_number: string | null; profiles: { full_name: string | null } | null } | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const attemptsQ = useQuery({
    queryKey: ["officer-security-attempts", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!schoolId) return [] as AttemptRow[];
      const full =
        "id, exam_id, student_id, status, tab_switch_count, fullscreen_exit_count, total_score, security_review_status, submitted_at, examinations(title), students(matric_number, profiles(full_name))";
      const basic =
        "id, exam_id, student_id, status, tab_switch_count, fullscreen_exit_count, total_score, security_review_status, submitted_at, examinations(title), students(matric_number)";
      let res: { data: unknown; error: unknown } = await supabase
        .from("exam_attempts")
        .select(full)
        .eq("school_id", schoolId)
        .in("status", ["submitted", "terminated", "flagged"])
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(80);
      if (res.error) {
        res = await supabase
          .from("exam_attempts")
          .select(basic)
          .eq("school_id", schoolId)
          .in("status", ["submitted", "terminated", "flagged"])
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .limit(80);
      }
      if (res.error) throw res.error;
      return (res.data ?? []) as AttemptRow[];
    },
  });

  const eventsQ = useQuery({
    queryKey: ["officer-security-events", schoolId, selectedAttempt],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [] as EventRow[];
      let q = supabase
        .from("integrity_events")
        .select(
          "id, event_type, severity, description, created_at, exam_id, student_id, attempt_id, metadata",
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (selectedAttempt) q = q.eq("attempt_id", selectedAttempt);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const attempts = attemptsQ.data ?? [];
  const events = eventsQ.data ?? [];

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
    return counts;
  }, [events]);

  async function decide(
    attempt: AttemptRow,
    decision: "accepted" | "flagged" | "cancelled" | "further_review",
  ) {
    if (!schoolId || !user) return;
    setBusy(true);
    try {
      await supabase
        .from("exam_attempts")
        .update({
          security_review_status: decision,
          status: decision === "flagged" ? "flagged" : attempt.status,
        } as never)
        .eq("id", attempt.id);

      await supabase
        .from("results")
        .update({
          security_review_status: decision,
          security_review_note: note.trim() || null,
          status:
            decision === "accepted"
              ? "published"
              : decision === "cancelled"
                ? "cancelled"
                : "pending",
          released_at: decision === "accepted" ? new Date().toISOString() : null,
          released_by: decision === "accepted" ? user.userId : null,
        } as never)
        .eq("exam_id", attempt.exam_id)
        .eq("student_id", attempt.student_id);

      await supabase.from("audit_logs").insert({
        school_id: schoolId,
        actor_user_id: user.userId,
        actor_role: "examination_officer",
        action: `security_review_${decision}`,
        entity_type: "exam_attempt",
        entity_id: attempt.id,
        description: note.trim() || decision,
      } as never);

      toast.success(`Security review: ${decision.replaceAll("_", " ")}`);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["officer-security-attempts"] });
      await attemptsQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not update review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Security Review"
        description={`${user?.fullName ?? "Officer"} · Timeline of integrity events · Accept / Flag / Cancel results`}
      />

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {Object.entries(summary)
          .slice(0, 8)
          .map(([k, v]) => (
            <span key={k} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
              {k}: {v}
            </span>
          ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Submitted attempts">
          {attemptsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : attempts.length === 0 ? (
            <EmptyState
              title="No submitted attempts"
              description="When students finish CBT, attempts appear here for security review."
            />
          ) : (
            <ul className="space-y-3">
              {attempts.map((a) => (
                <li
                  key={a.id}
                  className={`rounded-xl border p-3 ${selectedAttempt === a.id ? "border-primary bg-primary/5" : "border-slate-100"}`}
                >
                  <button type="button" className="w-full text-left" onClick={() => setSelectedAttempt(a.id)}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">
                        {a.students?.profiles?.full_name ?? a.students?.matric_number ?? "Student"} · {a.students?.matric_number ?? "—"}
                      </p>
                      <StatusBadge status={(a.security_review_status || "pending").replaceAll("_", " ")} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {a.examinations?.title ?? "Exam"} · Score {a.total_score ?? "—"} · Tabs{" "}
                      {a.tab_switch_count} · FS {a.fullscreen_exit_count ?? 0}
                    </p>
                  </button>
                  {selectedAttempt === a.id && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <Textarea
                        rows={2}
                        placeholder="Review note (optional)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy} className="font-semibold" onClick={() => void decide(a, "accepted")}>
                          Accept result
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(a, "flagged")}>
                          Flag result
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(a, "further_review")}>
                          Further review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          disabled={busy}
                          onClick={() => void decide(a, "cancelled")}
                        >
                          Cancel result
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Event timeline"
          description={selectedAttempt ? "Events for selected attempt" : "Recent school-wide events"}
        >
          {eventsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : events.length === 0 ? (
            <EmptyState
              title="No security events"
              description="Tab switches, fullscreen exits, copy attempts, face events and connection changes appear here."
            />
          ) : (
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
              {events.map((ev) => (
                <li key={ev.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-slate-900">{ev.event_type}</p>
                    <span className="text-[10px] font-semibold uppercase text-slate-500">{ev.severity}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {ev.description || "—"} · {new Date(ev.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
