import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Camera, Radio, ShieldAlert } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";

export const Route = createFileRoute("/officer/live-monitor")({
  head: () => ({
    meta: [{ title: "Live Monitor — D4EXAM" }],
  }),
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
  examinations: { title: string; status: string; courses: { code: string } | null } | null;
  students: { full_name: string | null; matric_number: string | null; student_id: string | null } | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;

  useRealtimeInvalidate(
    `officer-live-${schoolId ?? "x"}`,
    schoolId
      ? [
          { table: "exam_attempts", filter: `school_id=eq.${schoolId}` },
          { table: "examinations", filter: `school_id=eq.${schoolId}` },
          { table: "security_events", filter: `school_id=eq.${schoolId}` },
        ]
      : [],
    [
      ["officer-live", schoolId],
      ["officer-live-attempts", schoolId],
      ["officer-live-events", schoolId],
    ],
    Boolean(schoolId),
    2000,
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

  // Students currently writing (in_progress attempts)
  const attemptsQ = useQuery({
    queryKey: ["officer-live-attempts", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 8_000,
    queryFn: async () => {
      if (!schoolId) return [] as AttemptRow[];
      const { data, error } = await supabase
        .from("exam_attempts")
        .select(
          `id, exam_id, student_id, status, started_at, tab_switch_count, metadata,
           examinations(title, status, courses(code)),
           students(full_name, matric_number, student_id)`,
        )
        .eq("school_id", schoolId)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as unknown as AttemptRow[];
    },
  });

  // Recent security signals (camera / face / tab) for live attempts
  const eventsQ = useQuery({
    queryKey: ["officer-live-events", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!schoolId) return [];
      try {
        const { data, error } = await supabase
          .from("security_events" as never)
          .select("id, event_type, severity, description, created_at, student_id, exam_id")
          .eq("school_id" as never, schoolId as never)
          .order("created_at", { ascending: false })
          .limit(40);
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  const rows = examsQ.data ?? [];
  const liveExams = rows.filter((e) => e.status === "ongoing");
  const upcoming = rows.filter((e) => e.status !== "ongoing");
  const attempts = attemptsQ.data ?? [];
  const events = eventsQ.data ?? [];

  // Only show attempts whose exam is not already finished/closed
  const activeAttempts = attempts.filter((a) => {
    const st = String(a.examinations?.status || "").toLowerCase();
    return !["completed", "closed", "cancelled"].includes(st);
  });

  return (
    <>
      <PageHeader
        title="Live Monitor"
        description={`${user?.fullName ?? "Officer"} · Active attempts refresh automatically`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">Live exams</p>
          <p className="mt-1 text-2xl font-extrabold">{liveExams.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700">Students writing now</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-800">{activeAttempts.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold text-slate-500">Upcoming / approved</p>
          <p className="mt-1 text-2xl font-extrabold">{upcoming.length}</p>
        </div>
      </div>

      <SectionCard
        title="Students writing now"
        description="In-progress attempts. When a student submits or the exam ends, they leave this list."
      >
        {attemptsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading attempts…</p>
        ) : activeAttempts.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="No students writing right now"
            description="When a student starts an exam, their attempt appears here until they submit or the session ends."
          />
        ) : (
          <ul className="space-y-3">
            {activeAttempts.map((a) => {
              const meta = (a.metadata ?? {}) as Record<string, unknown>;
              const cam =
                meta.cameraActive === true ||
                meta.camera_active === true ||
                String(meta.faceStatus || meta.face_status || "") !== "unavailable";
              const face = String(meta.faceStatus || meta.face_status || "unknown");
              const name =
                a.students?.full_name ||
                a.students?.matric_number ||
                a.students?.student_id ||
                "Student";
              const matric = a.students?.matric_number || a.students?.student_id || "—";
              const course = a.examinations?.courses?.code || "—";
              const title = a.examinations?.title || "Exam";
              const studentEvents = events.filter(
                (ev) =>
                  (ev as { student_id?: string }).student_id === a.student_id ||
                  (ev as { exam_id?: string }).exam_id === a.exam_id,
              ).length;

              return (
                <li
                  key={a.id}
                  className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3 sm:p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{name}</p>
                      <p className="text-xs text-slate-500">
                        {matric} · {course} · {title}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Started{" "}
                        {a.started_at ? new Date(a.started_at).toLocaleTimeString() : "—"}
                        {a.tab_switch_count != null
                          ? ` · Tab switches: ${a.tab_switch_count}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status="in progress" />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span
                      className={
                        cam
                          ? "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800"
                          : "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600"
                      }
                    >
                      <Camera className="h-3 w-3" />
                      {cam ? "Camera session active" : "Camera status unknown"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                      Face: {face}
                    </span>
                    {studentEvents > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                        <ShieldAlert className="h-3 w-3" />
                        {studentEvents} recent signal(s)
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-[10px] text-slate-400">
                    Live video stream requires dedicated streaming infrastructure. This panel shows
                    live attempt presence and proctoring signals from the exam session.
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard className="mt-6" title="Exams marked ongoing">
        {liveExams.length === 0 ? (
          <EmptyState
            title="No ongoing examinations"
            description="When an exam status is ongoing, it appears here."
          />
        ) : (
          <ul className="space-y-3">
            {liveExams.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"
              >
                <div>
                  <p className="text-sm font-bold">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {(e.courses as { code?: string } | null)?.code}
                  </p>
                </div>
                <StatusBadge status="ongoing" />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard className="mt-6" title="Scheduled / approved">
        {upcoming.length === 0 ? (
          <EmptyState title="None" description="Approved or scheduled exams will list here." />
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
