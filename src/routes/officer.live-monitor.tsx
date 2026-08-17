import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  WifiOff,
  X,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";
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

export const Route = createFileRoute("/officer/live-monitor")({
  head: () => ({ meta: [{ title: "Live Monitoring — D4EXAM" }] }),
  component: Page,
});

type AttemptRow = {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  started_at: string | null;
  tab_switch_count: number | null;
  metadata: Record<string, unknown> | null;
  examinations: { title: string; status: string; courses: { code: string; name?: string } | null } | null;
  students: { full_name: string | null; matric_number: string | null; student_id: string | null } | null;
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

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(new Set());
  const [showAlertsMobile, setShowAlertsMobile] = useState(false);

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
      const { data, error } = await supabase
        .from("exam_attempts")
        .select(
          `id, exam_id, student_id, status, started_at, tab_switch_count, metadata,
           examinations(title, status, courses(code, name)),
           students(full_name, matric_number, student_id)`,
        )
        .eq("school_id", schoolId)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as unknown as AttemptRow[];
    },
  });

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
    refetchInterval: 8_000,
    queryFn: async () => {
      if (!schoolId) return [] as IntegrityEvent[];
      const { data, error } = await supabase
        .from("integrity_events")
        .select("id, event_type, severity, description, created_at, student_id, exam_id")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) return [];
      return (data ?? []) as IntegrityEvent[];
    },
  });

  const liveExams = (examsQ.data ?? []).filter((e) => e.status === "ongoing");
  const attempts = attemptsQ.data ?? [];
  const events = eventsQ.data ?? [];
  const now = Date.now();

  const cards = useMemo(() => {
    return attempts.map((a) => {
      const presence = parsePresence(a.metadata);
      const sev = severityFromPresence(a.status, presence, now);
      const name = a.students?.full_name || a.students?.matric_number || a.students?.student_id || "Student";
      const matric = a.students?.matric_number || a.students?.student_id || "—";
      const course = a.examinations?.courses?.code || "—";
      const title = a.examinations?.title || "Exam";
      return { a, presence, sev, name, matric, course, title };
    });
  }, [attempts, now]);

  const stats = useMemo(() => {
    let online = 0, warnings = 0, violations = 0, offline = 0;
    for (const c of cards) {
      if (c.sev === "normal") online += 1;
      else if (c.sev === "warning") { warnings += 1; online += 1; }
      else if (c.sev === "violation") { violations += 1; online += 1; }
      else if (c.sev === "offline") offline += 1;
    }
    return { writing: cards.length, online, warnings, violations, offline, completed: completedQ.data ?? 0 };
  }, [cards, completedQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (filter !== "all" && c.sev !== filter) return false;
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
    return events.filter((e) => {
      const t = e.event_type.toUpperCase();
      return t.includes("FACE") || t.includes("CAMERA") || t.includes("TAB") || t.includes("FULLSCREEN") || t.includes("CONNECTION") || t.includes("SUBMIT") || e.severity === "high" || e.severity === "medium";
    }).slice(0, 25);
  }, [events]);

  const unreadAlerts = alerts.filter((a) => !readAlertIds.has(a.id));
  const selectedTimeline = useMemo(() => {
    if (!selected) return [];
    return events.filter((e) => e.student_id === selected.a.student_id || e.exam_id === selected.a.exam_id).slice(0, 20);
  }, [events, selected]);

  const primaryExamLabel = liveExams[0]
    ? `${(liveExams[0].courses as { code?: string } | null)?.code ?? ""} · ${liveExams[0].title}`
    : cards[0] ? `${cards[0].course} · ${cards[0].title}` : "No live exam";

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Live Monitoring"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> LIVE
            </span>
            <span className="text-slate-600">{primaryExamLabel}</span>
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Writing now" value={stats.writing} />
        <StatCard label="Online" value={stats.online} tone="emerald" />
        <StatCard label="Warnings" value={stats.warnings} tone="amber" />
        <StatCard label="Violations" value={stats.violations} tone="red" />
        <StatCard label="Offline" value={stats.offline} tone="slate" />
        <StatCard label="Completed (12h)" value={stats.completed} tone="blue" />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or matric…" className="h-9 pl-8 text-sm" />
          </div>
          <div className="flex flex-wrap gap-1">
            {([["all", "All"], ["normal", "Normal"], ["warning", "Warning"], ["violation", "Violations"], ["offline", "Offline"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold transition", filter === k ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button type="button" onClick={() => setView("grid")} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold", view === "grid" ? "bg-primary text-white" : "text-slate-600")}><LayoutGrid className="h-3.5 w-3.5" /> Grid</button>
            <button type="button" onClick={() => setView("list")} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold", view === "list" ? "bg-primary text-white" : "text-slate-600")}><List className="h-3.5 w-3.5" /> List</button>
          </div>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowAlertsMobile(true)}>
            <ShieldAlert className="mr-1 h-4 w-4" /> Alerts ({unreadAlerts.length})
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
        <div>
          {attemptsQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading live sessions…</p>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Radio} title="No students match this view" description="When students start writing with camera monitoring, their presence appears here in realtime from exam_attempts metadata and integrity events." />
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {filtered.map((c) => (
                <StudentCard key={c.a.id} name={c.name} matric={c.matric} course={c.course} sev={c.sev} presence={c.presence} onClick={() => setSelectedId(c.a.id)} />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((c) => (
                <li key={c.a.id}>
                  <button type="button" onClick={() => setSelectedId(c.a.id)} className={cn("flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md", severityBorderClass(c.sev))}>
                    <StatusAvatar sev={c.sev} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{c.name}</p>
                      <p className="truncate text-[11px] text-slate-500">{c.matric} · {c.course}</p>
                    </div>
                    <FaceChip presence={c.presence} sev={c.sev} />
                    <span className="font-mono text-[11px] font-semibold text-slate-600">{formatDuration(c.presence.timeRemainingSec)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="hidden lg:block">
          <AlertsPanel alerts={alerts} readIds={readAlertIds} studentNameById={studentNameById} onOpen={(sid) => { const card = cards.find((c) => c.a.student_id === sid); if (card) setSelectedId(card.a.id); }} onMarkAll={() => setReadAlertIds(new Set(alerts.map((a) => a.id)))} />
        </aside>
      </div>

      {showAlertsMobile && (
        <div className="fixed inset-0 z-[60] bg-black/40 lg:hidden" onClick={() => setShowAlertsMobile(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">Alerts</h3>
              <button type="button" onClick={() => setShowAlertsMobile(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <AlertsPanel alerts={alerts} readIds={readAlertIds} studentNameById={studentNameById} onOpen={(sid) => { const card = cards.find((c) => c.a.student_id === sid); if (card) { setSelectedId(card.a.id); setShowAlertsMobile(false); } }} onMarkAll={() => setReadAlertIds(new Set(alerts.map((a) => a.id)))} />
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" onClick={() => setSelectedId(null)}>
          <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-slate-900">{selected.name}</p>
                <p className="truncate text-[11px] text-slate-500">{selected.matric}</p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100" onClick={() => setSelectedId(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="relative aspect-video bg-slate-900">
              <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE STATUS
              </div>
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-white">
                <UserRound className="h-12 w-12 opacity-40" />
                <p className="text-sm font-semibold">{faceLabel(selected.presence)}</p>
                <p className="text-[11px] text-white/70">Realtime presence from the student CBT session (face, camera, connection). Events are stored in integrity_events.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4 text-sm">
              <Info label="Course" value={selected.course} />
              <Info label="Exam" value={selected.title} />
              <Info label="Time left" value={formatDuration(selected.presence.timeRemainingSec)} />
              <Info label="Answered" value={selected.presence.answeredCount != null && selected.presence.totalQuestions != null ? `${selected.presence.answeredCount} / ${selected.presence.totalQuestions}` : "—"} />
              <Info label="Connection" value={isOnline(selected.presence.lastSeenAt) ? "Online" : "Offline"} />
              <Info label="Camera" value={selected.presence.cameraActive ? "Active" : "Off"} />
              <Info label="Face" value={faceLabel(selected.presence)} />
              <Info label="Fullscreen" value={selected.presence.fullscreen ? "On" : "Off"} />
            </div>
            <div className="p-4">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Events timeline</h4>
              {selectedTimeline.length === 0 ? (
                <p className="text-xs text-slate-500">No integrity events yet for this student.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedTimeline.map((ev) => (
                    <li key={ev.id} className="flex gap-2 text-xs">
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", ev.severity === "high" ? "bg-red-500" : ev.severity === "medium" ? "bg-amber-500" : "bg-emerald-500")} />
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
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "emerald" | "amber" | "red" | "blue" }) {
  const tones = { slate: "border-slate-200 bg-white", emerald: "border-emerald-100 bg-emerald-50/60", amber: "border-amber-100 bg-amber-50/60", red: "border-red-100 bg-red-50/60", blue: "border-sky-100 bg-sky-50/60" };
  return (
    <div className={cn("rounded-xl border p-3 shadow-sm", tones[tone])}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function StatusAvatar({ sev }: { sev: MonitorSeverity }) {
  return (
    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-white", sev === "normal" && "bg-emerald-500", sev === "warning" && "bg-amber-500", sev === "violation" && "bg-red-600", sev === "offline" && "bg-slate-400", sev === "completed" && "bg-slate-300")}>
      {sev === "offline" ? <WifiOff className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
    </span>
  );
}

function FaceChip({ presence, sev }: { presence: ReturnType<typeof parsePresence>; sev: MonitorSeverity }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white", severityBadgeClass(sev))}>
      {!presence.cameraActive ? <CameraOff className="h-3 w-3" /> : sev === "normal" ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {faceLabel(presence)}
    </span>
  );
}

function StudentCard({ name, matric, course, sev, presence, onClick }: { name: string; matric: string; course: string; sev: MonitorSeverity; presence: ReturnType<typeof parsePresence>; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("overflow-hidden rounded-xl border-2 bg-white text-left shadow-sm transition hover:shadow-md", severityBorderClass(sev))}>
      <div className="relative aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900">
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
          <span className={cn("h-1.5 w-1.5 rounded-full", isOnline(presence.lastSeenAt) ? "animate-pulse bg-emerald-400" : "bg-slate-400")} />
          {isOnline(presence.lastSeenAt) ? "Live" : "Offline"}
        </span>
        <div className="flex h-full items-center justify-center"><UserRound className="h-10 w-10 text-white/25" /></div>
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1">
          <FaceChip presence={presence} sev={sev} />
          <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">{formatDuration(presence.timeRemainingSec)}</span>
        </div>
      </div>
      <div className="p-2">
        <p className="truncate text-xs font-bold text-slate-900 sm:text-sm">{name}</p>
        <p className="truncate text-[10px] text-slate-500">{matric} · {course}</p>
      </div>
    </button>
  );
}

function AlertsPanel({ alerts, readIds, studentNameById, onOpen, onMarkAll }: { alerts: IntegrityEvent[]; readIds: Set<string>; studentNameById: Map<string, { name: string; matric: string }>; onOpen: (studentId: string | null) => void; onMarkAll: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <h3 className="text-sm font-extrabold text-slate-900">Alerts <span className="text-slate-400">({alerts.length})</span></h3>
        <button type="button" onClick={onMarkAll} className="text-[11px] font-semibold text-primary hover:underline">Mark all read</button>
      </div>
      <ul className="max-h-[28rem] divide-y divide-slate-50 overflow-y-auto">
        {alerts.length === 0 ? (
          <li className="p-4 text-center text-xs text-slate-500">No recent alerts</li>
        ) : alerts.map((ev) => {
          const who = ev.student_id ? studentNameById.get(ev.student_id) : null;
          const high = ev.severity === "high";
          const med = ev.severity === "medium";
          return (
            <li key={ev.id}>
              <button type="button" onClick={() => onOpen(ev.student_id)} className={cn("flex w-full gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50", !readIds.has(ev.id) && "bg-slate-50/50")}>
                <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", high ? "bg-red-100 text-red-600" : med ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>
                  {high ? <ShieldAlert className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{who?.name ?? "Student"}</p>
                  <p className={cn("truncate text-[11px] font-semibold", high ? "text-red-600" : med ? "text-amber-700" : "text-slate-600")}>{humanEventLabel(ev.event_type, ev.description)}</p>
                  <p className="text-[10px] text-slate-400">{relativeTime(ev.created_at)}</p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
