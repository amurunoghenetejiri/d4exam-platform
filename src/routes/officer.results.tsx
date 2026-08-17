import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { notifyStudentsResultsReleased } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { humanEventLabel, relativeTime } from "@/lib/live-monitor";

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

type ResultRow = {
  id: string;
  exam_id: string;
  student_id: string;
  attempt_id: string | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  grade: string | null;
  pass_fail: string | null;
  correct_count: number | null;
  wrong_count: number | null;
  unanswered_count: number | null;
  status: string;
  security_review_status: string | null;
  released_at: string | null;
  created_at: string | null;
  students: {
    full_name: string | null;
    matric_number: string | null;
    student_id: string | null;
  } | null;
};

type IntegrityEvent = {
  id: string;
  event_type: string;
  severity: string | null;
  description: string | null;
  created_at: string;
};

function isHeldStatus(status: string, releasedAt: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "published" || releasedAt) return false;
  return true;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        .limit(60);
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  const examIds = (examsQ.data ?? []).map((e) => e.id);

  const attemptsQ = useQuery({
    queryKey: ["officer-exam-attempts", schoolId, examIds.join(",")],
    enabled: Boolean(schoolId && examIds.length),
    queryFn: async () => {
      if (!examIds.length) return {} as Record<string, { total: number; finished: number }>;
      const { data, error } = await supabase.from("exam_attempts").select("exam_id, status").in("exam_id", examIds);
      if (error) throw error;
      const map: Record<string, { total: number; finished: number }> = {};
      for (const a of data ?? []) {
        const eid = (a as { exam_id: string }).exam_id;
        if (!map[eid]) map[eid] = { total: 0, finished: 0 };
        map[eid].total += 1;
        const st = String((a as { status: string }).status || "").toLowerCase();
        if (["submitted", "completed", "finished", "graded", "marked", "terminated", "flagged"].includes(st)) {
          map[eid].finished += 1;
        }
      }
      return map;
    },
  });

  const resultsCountsQ = useQuery({
    queryKey: ["officer-results-counts", schoolId, examIds.join(",")],
    enabled: Boolean(schoolId && examIds.length),
    queryFn: async () => {
      if (!examIds.length) return {} as Record<string, { total: number; held: number; published: number; flagged: number }>;
      const { data, error } = await supabase
        .from("results")
        .select("exam_id, status, released_at, security_review_status")
        .eq("school_id", schoolId!)
        .in("exam_id", examIds);
      if (error) throw error;
      const map: Record<string, { total: number; held: number; published: number; flagged: number }> = {};
      for (const r of data ?? []) {
        const eid = (r as { exam_id: string }).exam_id;
        if (!map[eid]) map[eid] = { total: 0, held: 0, published: 0, flagged: 0 };
        map[eid].total += 1;
        const held = isHeldStatus(String((r as { status: string }).status), (r as { released_at: string | null }).released_at);
        if (held) map[eid].held += 1;
        else map[eid].published += 1;
        const sec = String((r as { security_review_status: string | null }).security_review_status || "").toLowerCase();
        if (sec === "flagged") map[eid].flagged += 1;
      }
      return map;
    },
  });

  const selectedExam = (examsQ.data ?? []).find((e) => e.id === selectedExamId) ?? null;

  const examResultsQ = useQuery({
    queryKey: ["officer-exam-results", schoolId, selectedExamId],
    enabled: Boolean(schoolId && selectedExamId),
    queryFn: async () => {
      if (!schoolId || !selectedExamId) return [] as ResultRow[];
      const { data, error } = await supabase
        .from("results")
        .select(
          `id, exam_id, student_id, attempt_id, total_score, max_score, percentage, grade, pass_fail,
           correct_count, wrong_count, unanswered_count, status, security_review_status, released_at, created_at,
           students(full_name, matric_number, student_id)`,
        )
        .eq("school_id", schoolId)
        .eq("exam_id", selectedExamId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ResultRow[];
    },
  });

  const selectedResult = (examResultsQ.data ?? []).find((r) => r.id === selectedResultId) ?? null;

  const detailEventsQ = useQuery({
    queryKey: ["officer-result-events", schoolId, selectedResult?.student_id, selectedResult?.exam_id],
    enabled: Boolean(schoolId && selectedResult?.student_id && selectedResult?.exam_id),
    queryFn: async () => {
      if (!schoolId || !selectedResult) return [] as IntegrityEvent[];
      const { data, error } = await supabase
        .from("integrity_events")
        .select("id, event_type, severity, description, created_at")
        .eq("school_id", schoolId)
        .eq("exam_id", selectedResult.exam_id)
        .eq("student_id", selectedResult.student_id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) return [];
      return (data ?? []) as IntegrityEvent[];
    },
  });

  const attemptDetailQ = useQuery({
    queryKey: ["officer-result-attempt", selectedResult?.attempt_id, selectedResult?.exam_id, selectedResult?.student_id],
    enabled: Boolean(selectedResult),
    queryFn: async () => {
      if (!selectedResult) return null;
      if (selectedResult.attempt_id) {
        const { data } = await supabase
          .from("exam_attempts")
          .select("id, status, started_at, submitted_at, tab_switch_count, metadata")
          .eq("id", selectedResult.attempt_id)
          .maybeSingle();
        if (data) return data;
      }
      const { data } = await supabase
        .from("exam_attempts")
        .select("id, status, started_at, submitted_at, tab_switch_count, metadata")
        .eq("exam_id", selectedResult.exam_id)
        .eq("student_id", selectedResult.student_id)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  async function markCompleted(id: string) {
    if (!schoolId || !user) return;
    const stats = attemptsQ.data?.[id];
    if (stats && stats.total > 0 && stats.finished < stats.total) {
      toast.error(`Cannot complete yet — ${stats.finished} of ${stats.total} attempts finished.`);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("examinations")
        .update({ status: "completed" } as never)
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Marked completed");
      await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function releaseResults(examId: string) {
    if (!schoolId || !user) return;
    if (!confirm("Release results to students? Flagged attempts stay under review.")) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("results")
        .update({
          status: "published",
          released_at: now,
          released_by: user.userId,
        } as never)
        .eq("exam_id", examId)
        .eq("school_id", schoolId)
        .neq("security_review_status", "flagged")
        .select("id, student_id");
      if (error) throw error;
      const released = data ?? [];
      await supabase.from("audit_logs").insert({
        school_id: schoolId,
        actor_user_id: user.userId,
        actor_role: "examination_officer",
        action: "results_released",
        entity_type: "examination",
        entity_id: examId,
        description: `Released ${released.length} result(s)`,
        metadata: { result_ids: released.map((r) => r.id), count: released.length },
      } as never);
      const studentIds = [...new Set(released.map((r) => r.student_id).filter(Boolean))] as string[];
      if (studentIds.length) {
        const examTitle = (examsQ.data ?? []).find((e) => e.id === examId)?.title ?? "your examination";
        void notifyStudentsResultsReleased({ schoolId, studentIds, examTitle });
      }
      toast.success(`Released ${released.length} result(s)`);
      await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
      await qc.invalidateQueries({ queryKey: ["officer-results-counts"] });
      await qc.invalidateQueries({ queryKey: ["officer-exam-results"] });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function holdAllResults(examId: string) {
    if (!schoolId || !user) return;
    if (!confirm("Hold all results? Students will not see scores until released.")) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("results")
        .update({ status: "pending", released_at: null } as never)
        .eq("exam_id", examId)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Results held for review");
      await qc.invalidateQueries({ queryKey: ["officer-results-counts"] });
      await qc.invalidateQueries({ queryKey: ["officer-exam-results"] });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
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
      toast.error("Invalid schedule");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("examinations")
        .update({
          scheduled_start: start.toISOString(),
          scheduled_end: end.toISOString(),
          status: "scheduled",
        } as never)
        .eq("id", examId)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Exam rescheduled");
      await qc.invalidateQueries({ queryKey: ["officer-results-exams"] });
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function allowRewrite(examId: string) {
    if (!schoolId || !user) return;
    const matric = window.prompt("Student matric to allow rewrite:");
    if (!matric?.trim()) return;
    const { data: st } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .ilike("matric_number", matric.trim())
      .maybeSingle();
    if (!st?.id) {
      toast.error("Student not found");
      return;
    }
    if (!confirm(`Clear attempt for ${matric.trim()}?`)) return;
    setBusy(true);
    try {
      await supabase.from("exam_attempts").delete().eq("exam_id", examId).eq("student_id", st.id as string);
      await supabase.from("results").delete().eq("exam_id", examId).eq("student_id", st.id as string);
      toast.success("Attempt cleared — student can rewrite");
      await qc.invalidateQueries({ queryKey: ["officer-exam-attempts"] });
      await qc.invalidateQueries({ queryKey: ["officer-exam-results"] });
      await qc.invalidateQueries({ queryKey: ["officer-results-counts"] });
    } finally {
      setBusy(false);
    }
  }

  const rows = examsQ.data ?? [];
  const attempts = attemptsQ.data ?? {};
  const counts = resultsCountsQ.data ?? {};

  // —— Detail panel: one student result ——
  if (selectedExam && selectedResult) {
    const name =
      selectedResult.students?.full_name ||
      selectedResult.students?.matric_number ||
      selectedResult.students?.student_id ||
      "Student";
    const matric = selectedResult.students?.matric_number || selectedResult.students?.student_id || "—";
    const held = isHeldStatus(selectedResult.status, selectedResult.released_at);
    const pct = Number(selectedResult.percentage ?? 0);
    const pass = String(selectedResult.pass_fail || "").toLowerCase() === "pass";
    const sec = String(selectedResult.security_review_status || "pending").toLowerCase();
    const attempt = attemptDetailQ.data as {
      started_at?: string | null;
      submitted_at?: string | null;
      tab_switch_count?: number | null;
      status?: string | null;
    } | null;
    const events = detailEventsQ.data ?? [];

    return (
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <button
          type="button"
          onClick={() => setSelectedResultId(null)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to students
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-slate-900">{name}</p>
              <p className="truncate text-[11px] text-slate-500">{matric}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {selectedExam.courses?.code} · {selectedExam.title}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {held ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Held
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Released
                </span>
              )}
              {sec === "flagged" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  <ShieldAlert className="h-3 w-3" /> Flagged
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Score" value={`${selectedResult.total_score ?? "—"} / ${selectedResult.max_score ?? "—"}`} />
            <MiniStat label="%" value={`${Math.round(pct)}%`} />
            <MiniStat label="Grade" value={selectedResult.grade || "—"} />
            <MiniStat
              label="Result"
              value={pass ? "PASS" : selectedResult.pass_fail ? "FAIL" : "—"}
              tone={pass ? "green" : selectedResult.pass_fail ? "red" : "slate"}
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-lg bg-emerald-50 py-2">
              <p className="font-extrabold text-emerald-800">{selectedResult.correct_count ?? "—"}</p>
              <p className="text-emerald-700">Correct</p>
            </div>
            <div className="rounded-lg bg-red-50 py-2">
              <p className="font-extrabold text-red-800">{selectedResult.wrong_count ?? "—"}</p>
              <p className="text-red-700">Wrong</p>
            </div>
            <div className="rounded-lg bg-amber-50 py-2">
              <p className="font-extrabold text-amber-900">{selectedResult.unanswered_count ?? "—"}</p>
              <p className="text-amber-800">Blank</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:text-xs">
            <Meta label="Submitted" value={formatWhen(attempt?.submitted_at ?? selectedResult.created_at)} />
            <Meta label="Started" value={formatWhen(attempt?.started_at)} />
            <Meta label="Attempt" value={attempt?.status || "—"} />
            <Meta label="Tab switches" value={String(attempt?.tab_switch_count ?? 0)} />
            <Meta label="Security" value={(selectedResult.security_review_status || "pending").replaceAll("_", " ")} />
            <Meta label="Released" value={selectedResult.released_at ? formatWhen(selectedResult.released_at) : "Not yet"} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Activity log</h3>
          {detailEventsQ.isLoading ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </p>
          ) : events.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No integrity events recorded for this attempt.</p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-2 text-xs">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      ev.severity === "high"
                        ? "bg-red-500"
                        : ev.severity === "medium"
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">{humanEventLabel(ev.event_type, ev.description)}</p>
                    <p className="text-slate-500">{relativeTime(ev.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // —— Students for one exam ——
  if (selectedExam) {
    const results = examResultsQ.data ?? [];
    const heldCount = results.filter((r) => isHeldStatus(r.status, r.released_at)).length;

    return (
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <button
          type="button"
          onClick={() => {
            setSelectedExamId(null);
            setSelectedResultId(null);
          }}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All examinations
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-primary">{selectedExam.courses?.code}</p>
              <h2 className="text-sm font-extrabold text-slate-900 sm:text-base">{selectedExam.title}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {selectedExam.courses?.name}
                {selectedExam.duration_minutes ? ` · ${selectedExam.duration_minutes} min` : ""}
              </p>
              <p className="text-[11px] text-slate-500">{formatWhen(selectedExam.scheduled_start)}</p>
            </div>
            <StatusPill status={selectedExam.status} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {selectedExam.status !== "completed" && selectedExam.status !== "closed" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                disabled={busy}
                onClick={() => void markCompleted(selectedExam.id)}
              >
                Complete
              </Button>
            )}
            <Button
              size="sm"
              className="h-8 px-2.5 text-xs font-semibold"
              disabled={busy}
              onClick={() => void releaseResults(selectedExam.id)}
            >
              Release ({heldCount})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs"
              disabled={busy}
              onClick={() => void holdAllResults(selectedExam.id)}
            >
              Hold all
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs"
              disabled={busy}
              onClick={() => void rescheduleExam(selectedExam.id)}
            >
              Reschedule
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs"
              disabled={busy}
              onClick={() => void allowRewrite(selectedExam.id)}
            >
              Rewrite
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Student results ({results.length})
            </h3>
            {heldCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {heldCount} held
              </span>
            )}
          </div>

          {examResultsQ.isLoading ? (
            <p className="p-4 text-sm text-slate-500">Loading results…</p>
          ) : results.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No results yet" description="When students submit, their scores appear here for review and release." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {results.map((r) => {
                const name = r.students?.full_name || r.students?.matric_number || "Student";
                const matric = r.students?.matric_number || r.students?.student_id || "—";
                const held = isHeldStatus(r.status, r.released_at);
                const flagged = String(r.security_review_status || "").toLowerCase() === "flagged";
                const pct = Math.round(Number(r.percentage ?? 0));
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedResultId(r.id)}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50 sm:gap-3"
                    >
                      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                        <UserRound className="h-4 w-4" />
                        {held && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900 sm:text-sm">{name}</p>
                        <p className="truncate text-[10px] text-slate-500 sm:text-[11px]">{matric}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-xs font-extrabold tabular-nums text-slate-900">{pct}%</span>
                        <span className="text-[10px] font-semibold text-slate-500">{r.grade || "—"}</span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        {held ? (
                          <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-700">Held</span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">Out</span>
                        )}
                        {flagged && (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">Flag</span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // —— Exam list (default) ——
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Results Release"
        description="Open an exam to review student results. Held scores stay hidden until you release them."
      />

      {examsQ.isLoading ? (
        <p className="text-sm text-slate-500">Loading examinations…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No examinations yet" description="Approved and scheduled exams appear here." />
      ) : (
        <ul className="space-y-2">
          {rows.map((e) => {
            const st = attempts[e.id];
            const rc = counts[e.id];
            const blocked = st && st.total > 0 && st.finished < st.total && e.status !== "completed";
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelectedExamId(e.id)}
                  className="flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md sm:gap-3 sm:p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {e.courses?.code || "—"}
                      </span>
                      <StatusPill status={e.status} />
                      {(rc?.held ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          {rc!.held} held
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900">{e.title}</p>
                    <p className="truncate text-[11px] text-slate-500">{e.courses?.name}</p>
                    <p className="mt-1 text-[10px] text-slate-400 sm:text-[11px]">
                      {e.scheduled_start ? formatWhen(e.scheduled_start) : "Not scheduled"}
                      {e.duration_minutes ? ` · ${e.duration_minutes} min` : ""}
                      {st ? ` · ${st.finished}/${st.total} done` : " · No attempts"}
                      {rc ? ` · ${rc.total} result${rc.total === 1 ? "" : "s"}` : ""}
                    </p>
                    {blocked && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                        <Clock className="h-3 w-3" /> Waiting for remaining students
                      </p>
                    )}
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.replaceAll("_", " ");
  const lower = status.toLowerCase();
  const tone =
    lower === "completed" || lower === "closed"
      ? "bg-slate-100 text-slate-700"
      : lower === "ongoing"
        ? "bg-emerald-50 text-emerald-700"
        : lower === "scheduled" || lower === "published" || lower === "approved"
          ? "bg-sky-50 text-sky-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", tone)}>
      {s}
    </span>
  );
}

function MiniStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "green" | "red";
}) {
  const tones = {
    slate: "bg-slate-50 text-slate-900",
    green: "bg-emerald-50 text-emerald-800",
    red: "bg-red-50 text-red-800",
  };
  return (
    <div className={cn("rounded-lg px-2 py-2 text-center", tones[tone])}>
      <p className="text-[9px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-sm font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-50 py-1 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="truncate font-semibold capitalize text-slate-800">{value}</span>
    </div>
  );
}
