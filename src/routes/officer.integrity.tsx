import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  resolveStudentDetails,
  integritySeverityBand,
  integritySeverityClass,
} from "@/lib/resolve-student-details";
import { cn } from "@/lib/utils";

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
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameMap, setNameMap] = useState<
    Record<string, { fullName: string; matric: string }>
  >({});

  const attemptsQ = useQuery({
    queryKey: ["officer-security-attempts", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 20_000,
    queryFn: async () => {
      if (!schoolId) return [] as AttemptRow[];
      const sel =
        "id, exam_id, student_id, status, tab_switch_count, fullscreen_exit_count, total_score, security_review_status, submitted_at, examinations(title)";
      const { data, error } = await supabase
        .from("exam_attempts")
        .select(sel)
        .eq("school_id", schoolId)
        .in("status", ["submitted", "terminated", "flagged", "completed", "graded"])
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as AttemptRow[];
    },
  });

  const attempts = attemptsQ.data ?? [];

  useEffect(() => {
    const ids = [...new Set(attempts.map((a) => a.student_id).filter(Boolean))];
    if (!ids.length || !schoolId) return;
    void resolveStudentDetails(schoolId, ids).then((map) => {
      const next: Record<string, { fullName: string; matric: string }> = {};
      for (const [k, v] of Object.entries(map)) {
        next[k] = { fullName: v.fullName, matric: v.matric };
      }
      setNameMap(next);
    });
  }, [attempts, schoolId]);

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

  const events = eventsQ.data ?? [];

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
    return counts;
  }, [events]);

  function studentLabel(studentId: string) {
    const n = nameMap[studentId];
    if (n?.fullName && n.fullName !== "Student") {
      return `${n.fullName}${n.matric && n.matric !== "—" ? ` · ${n.matric}` : ""}`;
    }
    if (n?.matric && n.matric !== "—") return n.matric;
    return "Student";
  }

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

      // Sync to results table — same student + exam
      const resultStatus =
        decision === "accepted"
          ? "published"
          : decision === "cancelled"
            ? "cancelled"
            : decision === "flagged"
              ? "pending"
              : "pending";

      await supabase
        .from("results")
        .update({
          security_review_status: decision,
          security_review_note: note.trim() || null,
          status: resultStatus,
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

      toast.success(
        decision === "accepted"
          ? "Result accepted — also updated on Results Release"
          : decision === "flagged"
            ? "Result flagged — held on Results Release"
            : `Security review: ${decision.replaceAll("_", " ")}`,
      );
      setNote("");
      await qc.invalidateQueries({ queryKey: ["officer-security-attempts"] });
      await qc.invalidateQueries({ queryKey: ["officer-exam-results"] });
      await qc.invalidateQueries({ queryKey: ["officer-results-counts"] });
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
        title="Integrity Review"
        description={`${user?.fullName ?? "Officer"} · Expand a student for details · Accept / Flag syncs with Results Release`}
      />

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {Object.entries(summary)
          .slice(0, 8)
          .map(([k, v]) => (
            <span
              key={k}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700"
            >
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
              {attempts.map((a) => {
                const open = selectedAttempt === a.id;
                const review = (a.security_review_status || "pending").toLowerCase();
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "rounded-xl border p-3 transition",
                      open ? "border-primary bg-primary/5" : "border-slate-100 bg-white",
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedAttempt(open ? null : a.id)}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900">
                          {studentLabel(a.student_id)}
                        </p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            review === "accepted"
                              ? "bg-emerald-100 text-emerald-800"
                              : review === "flagged"
                                ? "bg-red-100 text-red-800"
                                : review === "further_review"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-orange-100 text-orange-900",
                          )}
                        >
                          {review.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {a.examinations?.title || "Examination"}
                        {a.total_score != null ? ` · Score ${a.total_score}` : ""}
                        {` · Tabs ${a.tab_switch_count ?? 0}`}
                        {a.fullscreen_exit_count != null
                          ? ` · FS ${a.fullscreen_exit_count}`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {open ? "Tap again to collapse" : "Tap to expand actions & timeline"}
                      </p>
                    </button>

                    {open ? (
                      <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                        <Textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Review note (optional)"
                          className="min-h-[72px] text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => void decide(a, "accepted")}
                          >
                            Accept result
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => void decide(a, "flagged")}
                          >
                            Flag result
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void decide(a, "further_review")}
                          >
                            Further review
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-700"
                            disabled={busy}
                            onClick={() => void decide(a, "cancelled")}
                          >
                            Cancel result
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Event timeline">
          <p className="mb-3 text-xs text-slate-500">
            {selectedAttempt
              ? "Events for the selected examination attempt only"
              : "Select a student attempt to filter events"}
          </p>
          {!selectedAttempt ? (
            <EmptyState
              title="No attempt selected"
              description="Tap a submitted attempt on the left to view its integrity timeline."
            />
          ) : eventsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading events…</p>
          ) : events.length === 0 ? (
            <EmptyState title="No events" description="No integrity events for this attempt." />
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
              {events.map((ev) => {
                const band = integritySeverityBand(ev.event_type, ev.severity);
                return (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-slate-900">{ev.event_type}</p>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                          integritySeverityClass(band),
                        )}
                      >
                        {band}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {ev.description || "—"} · {new Date(ev.created_at).toLocaleString()}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
