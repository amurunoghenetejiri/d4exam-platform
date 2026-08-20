import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CameraOff,
  LayoutGrid,
  List,
  Search,
  UserRound,
  Loader2,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { logSecurityEvent } from "@/lib/cbt-security";
import { notifyStudentOfficerWarning } from "@/lib/notify";
import { toast } from "sonner";
import {
  formatDuration,
  isOnline,
  parsePresence,
  severityBadgeClass,
  severityBorderClass,
  severityFromPresence,
} from "@/lib/live-monitor";
import {
  isLiveCamFrameFresh,
  startLiveCamSubscriber,
  type LiveCamFramePayload,
  type LiveCamSubscriber,
} from "@/lib/live-video";

export const Route = createFileRoute("/officer/live-monitor")({
  head: () => ({ meta: [{ title: "Live Monitoring — D4EXAM" }] }),
  component: Page,
});

const RECENT_SUBMIT_MS = 10 * 60 * 1000;

type AttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  started_at: string | null;
  updated_at?: string | null;
  tab_switch_count: number | null;
  metadata: Record<string, unknown> | null;
  examinations: { title: string; status: string; courses: { code: string; name?: string } | null } | null;
  students: {
    matric_number: string | null;
    student_id: string | null;
    profiles: { full_name: string | null } | null;
  } | null;
};

type FilterKey = "all" | "normal" | "warning" | "violation" | "offline";
type FrameEntry = { src: string; ts: number };

function doneStatusLabel(status: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "terminated") return "Terminated";
  if (s === "flagged") return "Flagged";
  if (s === "submitted") return "Submitted";
  return status || "Done";
}

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [frames, setFrames] = useState<Record<string, FrameEntry>>({});
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const unsubRef = useRef<LiveCamSubscriber | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useRealtimeInvalidate(
    schoolId
      ? [
          { table: "exam_attempts", filter: `school_id=eq.${schoolId}` },
          { table: "integrity_events", filter: `school_id=eq.${schoolId}` },
        ]
      : [],
    ["officer-live", "officer-live-attempts", "officer-live-recent-done", "officer-live-events"],
    1500,
  );

  const attemptsQ = useQuery({
    queryKey: ["officer-live-attempts", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 8_000,
    queryFn: async () => {
      if (!schoolId) return [] as AttemptRow[];
      const cols = [
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
           examinations(title, status, courses(code, name)),
           students(matric_number, student_id, profiles(full_name))`,
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
           examinations(title, status, courses(code, name)),
           students(matric_number, student_id)`,
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
           examinations(title, status),
           students(matric_number, student_id)`,
      ];
      let data: unknown[] | null = null;
      let error: { message?: string } | null = null;
      for (const sel of cols) {
        const res = await supabase
          .from("exam_attempts")
          .select(sel)
          .eq("school_id", schoolId)
          .eq("status", "in_progress")
          .order("started_at", { ascending: false })
          .limit(120);
        if (!res.error) {
          data = res.data ?? [];
          error = null;
          break;
        }
        error = res.error;
      }
      if (error) throw error;
      return (data ?? []) as unknown as AttemptRow[];
    },
  });

  const recentDoneQ = useQuery({
    queryKey: ["officer-live-recent-done", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!schoolId) return [] as AttemptRow[];
      const since = new Date(Date.now() - RECENT_SUBMIT_MS).toISOString();
      const selFull = `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
             examinations(title, status, courses(code, name)),
             students(matric_number, student_id, profiles(full_name))`;
      const selBasic = `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
             examinations(title, status),
             students(matric_number, student_id)`;
      let useSel = selFull;
      const probe = await supabase.from("exam_attempts").select(selFull).eq("school_id", schoolId).limit(1);
      if (probe.error) useSel = selBasic;
      const base = () =>
        supabase
          .from("exam_attempts")
          .select(useSel)
          .eq("school_id", schoolId)
          .in("status", ["submitted", "terminated", "flagged"])
          .limit(50);
      const bySubmitted = await base().gte("submitted_at", since).order("submitted_at", { ascending: false });
      if (!bySubmitted.error && (bySubmitted.data?.length ?? 0) > 0) {
        return (bySubmitted.data ?? []) as unknown as AttemptRow[];
      }
      const byUpdated = await base().gte("updated_at", since).order("updated_at", { ascending: false });
      if (byUpdated.error) return [];
      return (byUpdated.data ?? []) as unknown as AttemptRow[];
    },
  });

  useEffect(() => {
    const liveIds = new Set([
      ...(attemptsQ.data ?? []).map((a) => a.id),
      ...(recentDoneQ.data ?? []).map((a) => a.id),
    ]);
    setFrames((prev) => {
      const next: Record<string, FrameEntry> = {};
      let changed = false;
      for (const [id, entry] of Object.entries(prev)) {
        if (liveIds.has(id)) next[id] = entry;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [attemptsQ.data, recentDoneQ.data]);

  useEffect(() => {
    if (!schoolId) return;
    try {
      unsubRef.current?.stop();
    } catch {
      /* ignore */
    }
    unsubRef.current = startLiveCamSubscriber(schoolId, (payload: LiveCamFramePayload) => {
      const attemptId = payload?.attemptId || (payload as { attempt_id?: string })?.attempt_id;
      if (!attemptId || !payload?.frame) return;
      setFrames((prev) => ({
        ...prev,
        [attemptId]: { src: payload.frame, ts: payload.ts || Date.now() },
      }));
    });
    return () => {
      try {
        unsubRef.current?.stop();
      } catch {
        /* ignore */
      }
      unsubRef.current = null;
    };
  }, [schoolId]);

  const attempts = attemptsQ.data ?? [];
  const recentDone = recentDoneQ.data ?? [];

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attempts.filter((a) => {
      const name =
        a.students?.profiles?.full_name ||
        a.students?.matric_number ||
        a.students?.student_id ||
        "";
      const code = a.examinations?.courses?.code || "";
      if (q && !`${name} ${code} ${a.examinations?.title || ""}`.toLowerCase().includes(q)) return false;
      const presence = parsePresence(a.metadata);
      const sev = severityFromPresence(a.status, presence, now);
      const online = isOnline(presence.lastSeenAt, now);
      if (filter === "offline") return !online;
      if (filter === "normal") return online && sev === "normal";
      if (filter === "warning") return online && sev === "warning";
      if (filter === "violation") return online && sev === "violation";
      return true;
    });
  }, [attempts, search, filter, now]);

  async function sendWarning(attempt: AttemptRow) {
    if (!schoolId || !user) return;
    setBusyId(attempt.id);
    try {
      await logSecurityEvent({
        schoolId,
        examId: attempt.exam_id,
        studentId: attempt.student_id,
        attemptId: attempt.id,
        eventType: "OFFICER_WARNING",
        severity: "medium",
        description: "Officer sent a live warning",
      });
      await notifyStudentOfficerWarning({
        schoolId,
        studentId: attempt.student_id,
        examId: attempt.exam_id,
        examTitle: attempt.examinations?.title || "your examination",
      });
      toast.success("Warning sent to student");
    } catch (e) {
      toast.error((e as Error).message || "Could not send warning");
    } finally {
      setBusyId(null);
    }
  }

  if (!schoolId) {
    return <EmptyState title="No school linked" description="Your officer account is not linked to a school." />;
  }

  return (
    <>
      <PageHeader
        title="Live Monitoring"
        description={`${user?.fullName ?? "Officer"} · Active CBT sessions · camera tiles when available`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search student or course…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(["all", "normal", "warning", "violation", "offline"] as FilterKey[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={filter === k ? "default" : "outline"}
            className="font-semibold capitalize"
            onClick={() => setFilter(k)}
          >
            {k}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => setView(view === "grid" ? "list" : "grid")}>
          {view === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        </Button>
      </div>
      {attemptsQ.isLoading ? (
        <p className="text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading sessions…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No active sessions" description="Students in progress appear here with live camera when enabled." />
      ) : view === "grid" ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => {
            const name =
              a.students?.profiles?.full_name ||
              a.students?.matric_number ||
              a.students?.student_id ||
              "Student";
            const presence = parsePresence(a.metadata);
            const sev = severityFromPresence(a.status, presence, now);
            const online = isOnline(presence.lastSeenAt, now);
            const frame = frames[a.id];
            const fresh = frame && isLiveCamFrameFresh(frame.ts, now);
            return (
              <li key={a.id} className={cn("rounded-xl border bg-white p-3 shadow-sm", severityBorderClass(sev))}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {a.examinations?.courses?.code ?? "—"} · {a.examinations?.title ?? "Exam"}
                      {presence.timeRemainingSec != null ? ` · ${formatDuration(presence.timeRemainingSec)} left` : ""}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", severityBadgeClass(sev))}>
                    {online ? sev : "offline"}
                  </span>
                </div>
                <div className="mt-2 aspect-video overflow-hidden rounded-lg bg-slate-100">
                  {fresh && frame?.src ? (
                    <img src={frame.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-slate-400">
                      <CameraOff className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSelectedId(a.id)}>
                    Details
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busyId === a.id} onClick={() => void sendWarning(a)}>
                    Warn
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="divide-y rounded-xl border border-slate-200 bg-white">
          {rows.map((a) => {
            const name =
              a.students?.profiles?.full_name ||
              a.students?.matric_number ||
              a.students?.student_id ||
              "Student";
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <UserRound className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{name}</p>
                  <p className="truncate text-[11px] text-slate-500">{a.examinations?.title}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedId(a.id)}>Open</Button>
              </li>
            );
          })}
        </ul>
      )}
      {recentDone.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Recently finished</h3>
          <ul className="space-y-1 text-sm text-slate-600">
            {recentDone.slice(0, 8).map((a) => (
              <li key={a.id}>
                {a.students?.profiles?.full_name || a.students?.matric_number || "Student"} · {doneStatusLabel(a.status)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {selectedId ? null : null}
    </>
  );
}
