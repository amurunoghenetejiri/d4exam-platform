import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CameraOff,
  CheckCircle2,
  LayoutGrid,
  List,
  Radio,
  Search,
  ShieldAlert,
  UserRound,
  X,
  Wifi,
  WifiOff,
  MessageSquareWarning,
  Loader2,
  ChevronLeft,
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
  faceLabel,
  formatDuration,
  humanEventLabel,
  isOnline,
  parsePresence,
  relativeTime,
  severityBadgeClass,
  severityBorderClass,
  severityFromPresence,
  type MonitorSeverity,
} from "@/lib/live-monitor";
import {
  isLiveCamFrameFresh,
  startLiveCamSubscriber,
  LIVE_CAM_STALE_MS,
  type LiveCamFramePayload,
} from "@/lib/live-video";

export const Route = createFileRoute("/officer/live-monitor")({
  head: () => ({ meta: [{ title: "Live Monitoring — D4EXAM" }] }),
  component: Page,
});

const OFFLINE_HIDE_MS = 3 * 60 * 1000;
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
    full_name?: string | null;
    matric_number: string | null;
    student_id: string | null;
    profiles?: { full_name: string | null } | null;
  } | null;
};

type IntegrityEvent = {
  id: string;
  event_type: string;
  severity: string | null;
  description: string | null;
  created_at: string;
  student_id: string | null;
  exam_id: string | null;
};

type FilterKey = "all" | "normal" | "warning" | "violation" | "offline";
type FrameEntry = { src: string; ts: number };

function isFaceOrCameraLogOnly(eventType: string): boolean {
  const t = String(eventType || "").toUpperCase();
  return (
    t.includes("FACE") ||
    t.includes("CAMERA") ||
    t.includes("NO_FACE") ||
    t.includes("ONE_FACE") ||
    t.includes("MULTIPLE_FACE") ||
    t.includes("UNCLEAR")
  );
}

function doneStatusLabel(status: string): string {
  const st = String(status || "").toLowerCase();
  if (st === "submitted") return "Submitted";
  if (st === "terminated") return "Terminated";
  if (st === "flagged") return "Flagged";
  return "Ended";
}

function nameFromMetadata(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const m = meta as Record<string, unknown>;
  return String(m.studentName || m.full_name || m.student_name || "").trim();
}

function studentDisplayName(a: AttemptRow): string {
  const fromMeta = nameFromMetadata(a.metadata);
  if (fromMeta) return fromMeta;
  const fromStudent = String(a.students?.full_name || "").trim();
  if (fromStudent) return fromStudent;
  const fromProfile = String(a.students?.profiles?.full_name || "").trim();
  if (fromProfile) return fromProfile;
  return a.students?.matric_number || a.students?.student_id || "Student";
}

function signalBars(
  frameTs: number | null | undefined,
  lastSeenAt: string | null | undefined,
  now = Date.now(),
): 0 | 1 | 2 | 3 | 4 {
  const frameAge = frameTs != null ? now - frameTs : Infinity;
  const seenAge = lastSeenAt ? now - new Date(lastSeenAt).getTime() : Infinity;
  if (Number.isNaN(seenAge)) return 0;
  if (frameAge <= 2_500) return 4;
  if (frameAge <= 5_000) return 3;
  if (frameAge <= LIVE_CAM_STALE_MS || seenAge <= 15_000) return 2;
  if (seenAge <= 45_000) return 1;
  return 0;
}

function SignalBars({ bars, className }: { bars: number; className?: string }) {
  const color =
    bars >= 3 ? "bg-emerald-400" : bars === 2 ? "bg-amber-400" : bars === 1 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className={cn("flex items-end gap-0.5", className)} title={`Signal: ${bars}/4`} aria-label={`Signal ${bars} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[2.5px] rounded-sm transition-colors sm:w-[3px]",
            i <= bars ? color : "bg-white/25",
            i === 1 && "h-1",
            i === 2 && "h-1.5",
            i === 3 && "h-2.5",
            i === 4 && "h-3",
            "sm:h-auto",
            i === 1 && "sm:h-1.5",
            i === 2 && "sm:h-2.5",
            i === 3 && "sm:h-3.5",
            i === 4 && "sm:h-4",
          )}
        />
      ))}
    </div>
  );
}

function lastActivityMs(presenceLastSeen: string | null | undefined, row: AttemptRow): number | null {
  const candidates: number[] = [];
  if (presenceLastSeen) {
    const t = new Date(presenceLastSeen).getTime();
    if (!Number.isNaN(t)) candidates.push(t);
  }
  if (row.updated_at) {
    const t = new Date(row.updated_at).getTime();
    if (!Number.isNaN(t)) candidates.push(t);
  }
  if (row.started_at) {
    const t = new Date(row.started_at).getTime();
    if (!Number.isNaN(t)) candidates.push(t);
  }
  if (!candidates.length) return null;
  return Math.max(...candidates);
}

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(new Set());
  const [showAlertsMobile, setShowAlertsMobile] = useState(false);
  const [frames, setFrames] = useState<Record<string, FrameEntry>>({});
  const [warningBusy, setWarningBusy] = useState(false);
  const [, setTick] = useState(0);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  const alertsBootstrappedRef = useRef(false);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 3000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    const sub = startLiveCamSubscriber({
      schoolId,
      onFrame: (p: LiveCamFramePayload) => {
        const attemptId = p.attemptId || (p as { attempt_id?: string }).attempt_id;
        if (!attemptId || !p.frame) return;
        setFrames((prev) => ({
          ...prev,
          [attemptId]: { src: p.frame, ts: p.ts || Date.now() },
        }));
      },
    });
    return () => sub.stop();
  }, [schoolId]);

  useRealtimeInvalidate(
    `officer-live-${schoolId ?? "x"}`,
    schoolId
      ? [
          { table: "exam_attempts", filter: `school_id=eq.${schoolId}` },
          { table: "examinations", filter: `school_id=eq.${schoolId}` },
          { table: "integrity_events", filter: `school_id=eq.${schoolId}` },
        ]
      : [],
    [
      ["officer-live", schoolId],
      ["officer-live-attempts", schoolId],
      ["officer-live-events", schoolId],
      ["officer-live-completed", schoolId],
      ["officer-live-recent-done", schoolId],
    ],
    Boolean(schoolId),
    1500,
  );

  const examsQ = useQuery({
    queryKey: ["officer-live", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 12_000,
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, scheduled_start, scheduled_end, courses(code, name)")
        .eq("school_id", schoolId)
        .in("status", ["ongoing", "scheduled", "published", "approved"])
        .order("scheduled_start", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const attemptsQ = useQuery({
    queryKey: ["officer-live-attempts", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 6_000,
    queryFn: async () => {
      if (!schoolId) return [] as AttemptRow[];
      const selects = [
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
           examinations(title, status, courses(code, name)),
           students(full_name, matric_number, student_id, profiles(full_name))`,
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
           examinations(title, status, courses(code, name)),
           students(matric_number, student_id, profiles(full_name))`,
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
           examinations(title, status, courses(code, name)),
           students(full_name, matric_number, student_id)`,
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
           examinations(title, status),
           students(matric_number, student_id)`,
      ];
      let lastError: { message?: string } | null = null;
      for (const sel of selects) {
        const { data, error } = await supabase
          .from("exam_attempts")
          .select(sel)
          .eq("school_id", schoolId)
          .eq("status", "in_progress")
          .order("started_at", { ascending: false })
          .limit(120);
        if (!error) return (data ?? []) as unknown as AttemptRow[];
        lastError = error;
      }
      if (lastError) throw lastError;
      return [];
    },
  });

  const recentDoneQ = useQuery({
    queryKey: ["officer-live-recent-done", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 5_000,
    queryFn: async () => {
      if (!schoolId) return [] as AttemptRow[];
      const since = new Date(Date.now() - RECENT_SUBMIT_MS).toISOString();
      const selects = [
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
             examinations(title, status, courses(code, name)),
             students(full_name, matric_number, student_id, profiles(full_name))`,
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
             examinations(title, status, courses(code, name)),
             students(matric_number, student_id, profiles(full_name))`,
        `id, exam_id, student_id, status, started_at, updated_at, tab_switch_count, metadata,
             examinations(title, status),
             students(matric_number, student_id)`,
      ];
      let useSel = selects[0];
      for (const sel of selects) {
        const probe = await supabase.from("exam_attempts").select(sel).eq("school_id", schoolId).limit(1);
        if (!probe.error) {
          useSel = sel;
          break;
        }
      }
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

  const completedQ = useQuery({
    queryKey: ["officer-live-completed", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!schoolId) return 0;
      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .in("status", ["submitted", "terminated", "flagged"])
        .gte("updated_at", since);
      return count ?? 0;
    },
  });

  const eventsQ = useQuery({
    queryKey: ["officer-live-events", schoolId],
    enabled: Boolean(schoolId),
    staleTime: 1_000,
    refetchInterval: 4_000,
    queryFn: async () => {
      if (!schoolId) return [] as IntegrityEvent[];
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("integrity_events")
        .select("id, event_type, severity, description, created_at, student_id, exam_id")
        .eq("school_id", schoolId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) return [];
      return (data ?? []) as IntegrityEvent[];
    },
  });

  const liveExams = (examsQ.data ?? []).filter((e) => e.status === "ongoing");
  const events = eventsQ.data ?? [];
  const now = Date.now();

  const cards = useMemo(() => {
    const inProgress = attemptsQ.data ?? [];
    const recentDone = recentDoneQ.data ?? [];
    const merged = [...inProgress, ...recentDone];
    const seen = new Set<string>();
    return merged
      .filter((a) => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return true;
      })
      .map((a) => {
        const presence = parsePresence(a.metadata);
        const st = String(a.status || "").toLowerCase();
        const isDone = ["submitted", "terminated", "flagged", "completed"].includes(st);
        const sev: MonitorSeverity = isDone ? "completed" : severityFromPresence(a.status, presence, now);
        const name = studentDisplayName(a);
        const matric = a.students?.matric_number || a.students?.student_id || "—";
        const course = a.examinations?.courses?.code || "—";
        const title = a.examinations?.title || "Exam";
        const frame = frames[a.id];
        const hasLiveVideo = !isDone && Boolean(frame && isLiveCamFrameFresh(frame.ts, now));
        const bars = isDone ? 0 : signalBars(frame?.ts, presence.lastSeenAt, now);
        const activity = lastActivityMs(presence.lastSeenAt, a);
        return { a, presence, sev, name, matric, course, title, frame, hasLiveVideo, bars, isDone, activity };
      })
      .filter((c) => {
        if (c.isDone) {
          if (c.activity == null) return false;
          return now - c.activity <= RECENT_SUBMIT_MS;
        }
        if (c.sev === "offline") {
          if (c.activity == null) return false;
          return now - c.activity <= OFFLINE_HIDE_MS;
        }
        return true;
      });
  }, [attemptsQ.data, recentDoneQ.data, now, frames]);

  const stats = useMemo(() => {
    let online = 0,
      warnings = 0,
      violations = 0,
      offline = 0,
      writing = 0;
    for (const c of cards) {
      if (c.isDone) continue;
      writing += 1;
      if (c.sev === "normal") online += 1;
      else if (c.sev === "warning") {
        warnings += 1;
        online += 1;
      } else if (c.sev === "violation") {
        violations += 1;
        online += 1;
      } else if (c.sev === "offline") offline += 1;
    }
    return { writing, online, warnings, violations, offline, completed: completedQ.data ?? 0 };
  }, [cards, completedQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (filter === "offline" && c.sev !== "offline" && !c.isDone) return false;
      if (filter !== "all" && filter !== "offline" && (c.sev !== filter || c.isDone)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.matric.toLowerCase().includes(q) || c.course.toLowerCase().includes(q);
    });
  }, [cards, filter, search]);

  const selected = cards.find((c) => c.a.id === selectedId) ?? null;
  const studentNameById = useMemo(() => {
    const m = new Map<string, { name: string; matric: string }>();
    for (const c of cards) m.set(c.a.student_id, { name: c.name, matric: c.matric });
    return m;
  }, [cards]);

  const alerts = useMemo(() => {
    return events
      .filter((e) => {
        const t = e.event_type.toUpperCase();
        return (
          t.includes("FACE") ||
          t.includes("CAMERA") ||
          t.includes("TAB") ||
          t.includes("FULLSCREEN") ||
          t.includes("CONNECTION") ||
          t.includes("SUBMIT") ||
          t.includes("WARNING") ||
          t.includes("RESULT") ||
          t.includes("TERMINAT") ||
          e.severity === "high" ||
          e.severity === "medium"
        );
      })
      .slice(0, 40);
  }, [events]);

  useEffect(() => {
    if (!events.length) return;
    if (!alertsBootstrappedRef.current) {
      for (const e of events) seenAlertIdsRef.current.add(e.id);
      alertsBootstrappedRef.current = true;
      return;
    }
    for (const e of events) {
      if (seenAlertIdsRef.current.has(e.id)) continue;
      seenAlertIdsRef.current.add(e.id);
      if (isFaceOrCameraLogOnly(e.event_type)) continue;
      const high = e.severity === "high";
      const med = e.severity === "medium";
      if (!high && !med) continue;
      const who = e.student_id ? studentNameById.get(e.student_id)?.name : null;
      const label = humanEventLabel(e.event_type, e.description);
      const msg = who ? `${who}: ${label}` : label;
      if (high) toast.error(msg, { id: `alert-${e.id}`, duration: 5000 });
      else toast.warning(msg, { id: `alert-${e.id}`, duration: 4500 });
    }
  }, [events, studentNameById]);

  const unreadAlerts = alerts.filter((a) => !readAlertIds.has(a.id));
  const selectedTimeline = useMemo(() => {
    if (!selected) return [];
    return events
      .filter((e) => e.student_id === selected.a.student_id && (!e.exam_id || e.exam_id === selected.a.exam_id))
      .slice(0, 20);
  }, [events, selected]);

  const primaryExamLabel = liveExams[0]
    ? `${(liveExams[0].courses as { code?: string } | null)?.code ?? ""} · ${liveExams[0].title}`
    : cards[0]
      ? `${cards[0].course} · ${cards[0].title}`
      : "No live exam";

  async function sendOfficerWarning() {
    if (!selected || !schoolId || warningBusy || selected.isDone) return;
    setWarningBusy(true);
    try {
      await logSecurityEvent({
        schoolId,
        examId: selected.a.exam_id,
        attemptId: selected.a.id,
        studentId: selected.a.student_id,
        eventType: "WARNING_SHOWN",
        severity: "high",
        description: "Warning: Follow exam rules. Further violations may void your result.",
        extra: { source: "officer_live_monitor", officer_user_id: user?.userId ?? null, student_facing: true },
      });
      await notifyStudentOfficerWarning({
        schoolId,
        studentId: selected.a.student_id,
        examId: selected.a.exam_id,
        examTitle: selected.title,
        message: "Warning: Follow exam rules. Further violations may void your result.",
      });
      toast.success(`Warning sent to ${selected.name}`);
      void eventsQ.refetch();
    } catch (e) {
      toast.error("Could not send warning");
      console.warn(e);
    } finally {
      setWarningBusy(false);
    }
  }

  const FILTERS = [
    ["all", "All"],
    ["normal", "Normal"],
    ["warning", "Warn"],
    ["violation", "Viol."],
    ["offline", "Off"],
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-0 sm:px-0">
      <PageHeader
        title="Live Monitoring"
        description={
          <span className="flex flex-wrap items-center gap-1.5 text-[12px] sm:text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 sm:gap-1.5 sm:px-2 sm:text-[11px]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> LIVE
            </span>
            <span className="min-w-0 truncate text-slate-600">{primaryExamLabel}</span>
          </span>
        }
      />
      <div className="mb-3 grid grid-cols-3 gap-1.5 sm:mb-4 sm:grid-cols-3 sm:gap-2 lg:grid-cols-6">
        <StatCard label="Writing" value={stats.writing} />
        <StatCard label="Online" value={stats.online} tone="emerald" />
        <StatCard label="Warnings" value={stats.warnings} tone="amber" />
        <StatCard label="Violations" value={stats.violations} tone="red" />
        <StatCard label="Offline" value={stats.offline} tone="slate" />
        <StatCard label="Done (12h)" value={stats.completed} tone="blue" />
      </div>
      <div className="mb-3 space-y-2 sm:mb-4">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:h-3.5 sm:w-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or matric…"
            className="h-8 pl-8 text-xs sm:h-9 sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {FILTERS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold transition sm:px-2.5 sm:py-1 sm:text-[11px]",
                  filter === k ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-semibold sm:gap-1 sm:px-2 sm:py-1.5 sm:text-[11px]",
                view === "grid" ? "bg-primary text-white" : "text-slate-600",
              )}
            >
              <LayoutGrid className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Grid
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] font-semibold sm:gap-1 sm:px-2 sm:py-1.5 sm:text-[11px]",
                view === "list" ? "bg-primary text-white" : "text-slate-600",
              )}
            >
              <List className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> List
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2 text-[10px] lg:hidden sm:h-8 sm:text-xs"
            onClick={() => setShowAlertsMobile(true)}
          >
            <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Alerts ({unreadAlerts.length})
          </Button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:gap-4">
        <div>
          {attemptsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading live sessions…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Radio}
              title="No active students"
              description="Students appear here while writing. Offline sessions leave after 3 minutes. Video is never saved."
            />
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-3 xl:grid-cols-4">
              {filtered.map((c) => (
                <StudentCard
                  key={c.a.id}
                  name={c.name}
                  matric={c.matric}
                  course={c.course}
                  sev={c.sev}
                  presence={c.presence}
                  frameSrc={c.hasLiveVideo ? c.frame?.src : undefined}
                  streamLive={c.hasLiveVideo}
                  bars={c.bars}
                  isDone={c.isDone}
                  statusLabel={c.isDone ? doneStatusLabel(c.a.status) : undefined}
                  onClick={() => setSelectedId(c.a.id)}
                />
              ))}
            </div>
          ) : (
            <ul className="space-y-1.5 sm:space-y-2">
              {filtered.map((c) => (
                <li key={c.a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.a.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border bg-white p-2 text-left shadow-sm transition hover:shadow-md sm:gap-3 sm:rounded-xl sm:p-3",
                      severityBorderClass(c.sev),
                    )}
                  >
                    <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-slate-900 sm:h-12 sm:w-16 sm:rounded-lg">
                      {c.isDone ? (
                        <div className="grid h-full place-items-center bg-sky-900/50">
                          <CheckCircle2 className="h-5 w-5 text-sky-300" />
                        </div>
                      ) : c.hasLiveVideo && c.frame?.src ? (
                        <img src={c.frame.src} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center">
                          <UserRound className="h-4 w-4 text-white/30 sm:h-5 sm:w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900 sm:text-sm">{c.name}</p>
                      <p className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                        {c.matric} · {c.course}
                      </p>
                    </div>
                    {!c.isDone && <SignalBars bars={c.bars} className="hidden sm:flex" />}
                    <FaceChip
                      presence={c.presence}
                      sev={c.sev}
                      isDone={c.isDone}
                      statusLabel={c.isDone ? doneStatusLabel(c.a.status) : undefined}
                    />
                    {!c.isDone && (
                      <span className="hidden font-mono text-[10px] font-semibold text-slate-600 sm:inline sm:text-[11px]">
                        {formatDuration(c.presence.timeRemainingSec)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="hidden lg:block">
          <AlertsPanel
            alerts={alerts}
            readIds={readAlertIds}
            studentNameById={studentNameById}
            onOpen={(sid) => {
              const card = cards.find((c) => c.a.student_id === sid);
              if (card) setSelectedId(card.a.id);
            }}
            onMarkAll={() => setReadAlertIds(new Set(alerts.map((a) => a.id)))}
          />
        </aside>
      </div>
      {showAlertsMobile && (
        <div className="fixed inset-0 z-[60] bg-black/40 lg:hidden" onClick={() => setShowAlertsMobile(false)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-white p-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">Alerts</h3>
              <button type="button" onClick={() => setShowAlertsMobile(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <AlertsPanel
              alerts={alerts}
              readIds={readAlertIds}
              studentNameById={studentNameById}
              onOpen={(sid) => {
                const card = cards.find((c) => c.a.student_id === sid);
                if (card) {
                  setSelectedId(card.a.id);
                  setShowAlertsMobile(false);
                }
              }}
              onMarkAll={() => setReadAlertIds(new Set(alerts.map((a) => a.id)))}
            />
          </div>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={() => setSelectedId(null)}>
          <div
            className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3">
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setSelectedId(null)}
                aria-label="Back to all students"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Back
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-slate-900">{selected.name}</p>
                <p className="truncate text-[11px] text-slate-500">{selected.matric}</p>
              </div>
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-slate-100"
                onClick={() => setSelectedId(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative aspect-video bg-slate-900">
              {selected.hasLiveVideo && selected.frame?.src ? (
                <>
                  <img
                    src={selected.frame.src}
                    alt={`${selected.name} live camera`}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
                  </div>
                  <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1">
                    {selected.bars >= 2 ? (
                      <Wifi className="h-3 w-3 text-emerald-300" />
                    ) : (
                      <WifiOff className="h-3 w-3 text-red-300" />
                    )}
                    <SignalBars bars={selected.bars} />
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-white">
                    {selected.isDone
                      ? doneStatusLabel(selected.a.status).toUpperCase()
                      : selected.presence.cameraActive
                        ? "WAITING FOR VIDEO"
                        : "CAMERA OFF"}
                  </div>
                  <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1">
                    <SignalBars bars={selected.bars} />
                  </div>
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-white">
                    {selected.isDone ? (
                      <CheckCircle2 className="h-12 w-12 text-emerald-400/80" />
                    ) : selected.presence.cameraActive ? (
                      <UserRound className="h-12 w-12 opacity-40" />
                    ) : (
                      <CameraOff className="h-12 w-12 opacity-40" />
                    )}
                    <p className="text-sm font-semibold">
                      {selected.isDone ? doneStatusLabel(selected.a.status) : faceLabel(selected.presence)}
                    </p>
                    <p className="text-[11px] text-white/70">
                      {selected.isDone
                        ? "This student finished. Card leaves after 10 minutes."
                        : selected.presence.cameraActive
                          ? "Live frames appear when the student camera is streaming. Nothing is recorded."
                          : "Student camera is off or unavailable. Offline cards leave after 3 minutes."}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3 text-sm sm:p-4">
              <Info label="Course" value={selected.course} />
              <Info label="Exam" value={selected.title} />
              <Info label="Status" value={selected.isDone ? doneStatusLabel(selected.a.status) : selected.sev} />
              <Info
                label="Time left"
                value={selected.isDone ? "—" : formatDuration(selected.presence.timeRemainingSec)}
              />
              <Info
                label="Answered"
                value={
                  selected.presence.answeredCount != null && selected.presence.totalQuestions != null
                    ? `${selected.presence.answeredCount} / ${selected.presence.totalQuestions}`
                    : "—"
                }
              />
              <Info label="Connection" value={isOnline(selected.presence.lastSeenAt) ? "Online" : "Offline"} />
              <Info label="Camera" value={selected.presence.cameraActive ? "Active" : "Off"} />
              <Info label="Face" value={selected.isDone ? "—" : faceLabel(selected.presence)} />
              <Info label="Tab switches" value={String(selected.a.tab_switch_count ?? 0)} />
            </div>
            {!selected.isDone && (
              <div className="flex flex-wrap gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4 sm:py-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  disabled={warningBusy}
                  onClick={() => void sendOfficerWarning()}
                >
                  {warningBusy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquareWarning className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Send warning
                </Button>
                <p className="w-full text-[10px] text-slate-400">
                  Student gets a red alert instantly. Event is logged. Live video is never saved.
                </p>
              </div>
            )}
            <div className="p-3 sm:p-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Events timeline</h4>
              {selectedTimeline.length === 0 ? (
                <p className="text-xs text-slate-500">No integrity events yet for this student on this exam.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedTimeline.map((ev) => (
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
                        <p className="font-semibold text-slate-800">
                          {humanEventLabel(ev.event_type, ev.description)}
                        </p>
                        <p className="text-slate-500">{relativeTime(ev.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "amber" | "red" | "blue";
}) {
  const tones = {
    slate: "border-slate-200 bg-white",
    emerald: "border-emerald-100 bg-emerald-50/60",
    amber: "border-amber-100 bg-amber-50/60",
    red: "border-red-100 bg-red-50/60",
    blue: "border-sky-100 bg-sky-50/60",
  };
  return (
    <div className={cn("rounded-lg border p-2 shadow-sm sm:rounded-xl sm:p-3", tones[tone])}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[10px]">{label}</p>
      <p className="mt-0.5 text-base font-extrabold tabular-nums text-slate-900 sm:text-xl">{value}</p>
    </div>
  );
}

function FaceChip({
  presence,
  sev,
  isDone,
  statusLabel,
}: {
  presence: ReturnType<typeof parsePresence>;
  sev: MonitorSeverity;
  isDone?: boolean;
  statusLabel?: string;
}) {
  if (isDone) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold text-white sm:gap-1 sm:px-2 sm:text-[10px]">
        <CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
        {statusLabel || "Submitted"}
      </span>
    );
  }
  const isAmberFace = presence.faceStatus === "none" || presence.faceStatus === "unclear" || sev === "warning";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 truncate rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white sm:gap-1 sm:px-2 sm:text-[10px]",
        isAmberFace ? "bg-amber-500 text-white" : severityBadgeClass(sev),
      )}
    >
      {!presence.cameraActive ? (
        <CameraOff className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
      ) : sev === "normal" ? (
        <CheckCircle2 className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
      ) : (
        <AlertTriangle className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" />
      )}
      <span className="truncate">{faceLabel(presence)}</span>
    </span>
  );
}

function StudentCard({
  name,
  matric,
  course,
  sev,
  presence,
  frameSrc,
  streamLive,
  bars,
  isDone,
  statusLabel,
  onClick,
}: {
  name: string;
  matric: string;
  course: string;
  sev: MonitorSeverity;
  presence: ReturnType<typeof parsePresence>;
  frameSrc?: string;
  streamLive?: boolean;
  bars: number;
  isDone?: boolean;
  statusLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:shadow-md sm:rounded-xl sm:border-2",
        severityBorderClass(sev),
      )}
    >
      <div
        className={cn(
          "relative aspect-[5/4] sm:aspect-[4/3]",
          isDone
            ? "bg-gradient-to-br from-sky-800 via-slate-800 to-slate-900"
            : "bg-gradient-to-br from-slate-800 to-slate-900",
        )}
      >
        {isDone ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-sky-600/90 via-sky-800/80 to-slate-900 px-2 text-center">
            <CheckCircle2 className="h-8 w-8 text-white drop-shadow sm:h-10 sm:w-10" />
            <p className="rounded-full bg-sky-500/90 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow sm:text-[11px]">
              {statusLabel || "Submitted"}
            </p>
            <p className="text-[9px] font-semibold text-sky-100/90">Result pending release</p>
          </div>
        ) : frameSrc ? (
          <img src={frameSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <UserRound className="h-7 w-7 text-white/25 sm:h-10 sm:w-10" />
          </div>
        )}
        <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1 py-0.5 text-[8px] font-bold uppercase text-white sm:left-1.5 sm:top-1.5 sm:gap-1 sm:px-1.5 sm:text-[9px]">
          <span
            className={cn(
              "h-1 w-1 rounded-full sm:h-1.5 sm:w-1.5",
              isDone
                ? "bg-sky-400"
                : streamLive
                  ? "animate-pulse bg-red-500"
                  : isOnline(presence.lastSeenAt)
                    ? "animate-pulse bg-emerald-400"
                    : "bg-slate-400",
            )}
          />
          {isDone ? "Submitted" : streamLive ? "Live" : isOnline(presence.lastSeenAt) ? "Live" : "Off"}
        </span>
        {!isDone && (
          <div className="absolute right-1 top-1 rounded bg-black/55 px-1 py-0.5 sm:right-1.5 sm:top-1.5 sm:px-1.5 sm:py-1">
            <SignalBars bars={bars} />
          </div>
        )}
        <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-0.5 sm:bottom-1.5 sm:left-1.5 sm:right-1.5 sm:gap-1">
          <FaceChip presence={presence} sev={sev} isDone={isDone} statusLabel={statusLabel} />
          {!isDone && (
            <span className="shrink-0 rounded bg-black/50 px-1 py-0.5 font-mono text-[9px] font-semibold text-white sm:px-1.5 sm:text-[10px]">
              {formatDuration(presence.timeRemainingSec)}
            </span>
          )}
        </div>
      </div>
      <div className="p-1.5 sm:p-2">
        <p className="truncate text-[11px] font-bold leading-tight text-slate-900 sm:text-xs sm:text-sm">{name}</p>
        <p className="truncate text-[9px] leading-tight text-slate-500 sm:text-[10px]">
          {matric} · {course}
        </p>
      </div>
    </button>
  );
}

function AlertsPanel({
  alerts,
  readIds,
  studentNameById,
  onOpen,
  onMarkAll,
}: {
  alerts: IntegrityEvent[];
  readIds: Set<string>;
  studentNameById: Map<string, { name: string; matric: string }>;
  onOpen: (studentId: string | null) => void;
  onMarkAll: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <h3 className="text-sm font-extrabold text-slate-900">
          Alerts <span className="text-slate-400">({alerts.length})</span>
        </h3>
        <button type="button" onClick={onMarkAll} className="text-[11px] font-semibold text-primary hover:underline">
          Mark all read
        </button>
      </div>
      <ul className="max-h-[22rem] divide-y divide-slate-50 overflow-y-auto sm:max-h-[28rem]">
        {alerts.length === 0 ? (
          <li className="p-4 text-center text-xs text-slate-500">No recent alerts</li>
        ) : (
          alerts.map((ev) => {
            const who = ev.student_id ? studentNameById.get(ev.student_id) : null;
            const high = ev.severity === "high";
            const med = ev.severity === "medium";
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onOpen(ev.student_id)}
                  className={cn(
                    "flex w-full gap-2 px-3 py-2 text-left transition hover:bg-slate-50",
                    !readIds.has(ev.id) && "bg-slate-50/50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
                      high ? "bg-red-100 text-red-600" : med ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {high ? <ShieldAlert className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">{who?.name ?? "Student"}</p>
                    <p
                      className={cn(
                        "truncate text-[11px] font-semibold",
                        high ? "text-red-600" : med ? "text-amber-700" : "text-slate-600",
                      )}
                    >
                      {humanEventLabel(ev.event_type, ev.description)}
                    </p>
                    <p className="text-[10px] text-slate-400">{relativeTime(ev.created_at)}</p>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate text-sm font-semibold capitalize text-slate-900">{value}</p>
    </div>
  );
}
