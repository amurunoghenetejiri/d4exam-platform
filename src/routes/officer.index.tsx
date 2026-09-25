import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState, NavCard } from "@/components/dashboard/kit";
import { SplitHandle } from "@/components/dashboard/SplitHandle";
import { Button } from "@/components/ui/button";
import { CheckSquare, Radio, FileText, ShieldAlert, Send } from "lucide-react";
import { useCount, useRows } from "@/lib/queries";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";

export const Route = createFileRoute("/officer/")({
  head: () => ({
    meta: [{ title: "Departmental Officer Dashboard — D4EXAM" }],
  }),
  component: Page,
});

type Exam = {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
  courses: { code: string } | null;
};

type Audit = {
  id: string;
  action: string;
  description: string | null;
  created_at: string;
};

/** Keep writers visible for the full exam window; heartbeat refreshes updated_at. */
/** Only count writers seen recently (matches live-monitor offline hide window). */
const ACTIVE_WRITER_MS = 3 * 60 * 1000;

function isAttemptActiveNow(
  row: {
    updated_at?: string | null;
    started_at?: string | null;
    metadata?: Record<string, unknown> | null;
  },
  now = Date.now(),
): boolean {
  const meta = row.metadata ?? {};
  const lastSeen = String(meta.lastSeenAt ?? meta.last_seen_at ?? "");
  const candidates: number[] = [];
  if (lastSeen) {
    const t = new Date(lastSeen).getTime();
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
  if (!candidates.length) return true; // status is already in_progress
  return now - Math.max(...candidates) <= ACTIVE_WRITER_MS;
}

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const enabled = Boolean(schoolId);
  const [dashLeftPct, setDashLeftPct] = useState(50);
  const [dashStacked, setDashStacked] = useState(false);
  const dashSplitRef = useRef<HTMLDivElement | null>(null);
  const dashDrag = useRef(false);

  useRealtimeInvalidate(
    `officer-dash-${schoolId ?? "x"}`,
    schoolId
      ? [
          { table: "examinations", filter: `school_id=eq.${schoolId}` },
          { table: "exam_attempts", filter: `school_id=eq.${schoolId}` },
          { table: "results", filter: `school_id=eq.${schoolId}` },
          { table: "integrity_events", filter: `school_id=eq.${schoolId}` },
        ]
      : [],
    [
      ["count", "examinations"],
      ["officer-dash-live", schoolId],
      ["officer-dash-integrity", schoolId],
      ["rows", "examinations"], ["officer-dash-exams", schoolId],
      ["rows", "integrity_events"],
    ],
    enabled,
    2000,
  );

  // Live pending count (avoid stale offline 0 from useCount)
  const pendingQ = useQuery({
    queryKey: ["officer-dash-pending", schoolId],
    enabled,
    staleTime: 3_000,
    refetchInterval: 8_000,
    queryFn: async () => {
      if (!schoolId) return 0;
      const { count, error } = await supabase
        .from("examinations")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .in("status", ["pending_approval", "changes_requested"]);
      if (error) {
        console.warn("[officer-dash] pending", error.message);
        // fallback: fetch rows
        const { data } = await supabase
          .from("examinations")
          .select("id, status")
          .eq("school_id", schoolId)
          .in("status", ["pending_approval", "changes_requested"])
          .limit(200);
        return (data ?? []).length;
      }
      return count ?? 0;
    },
  });
  const pending = { data: pendingQ.data, isLoading: pendingQ.isLoading };

  const liveStatsQ = useQuery({
    queryKey: ["officer-dash-live", schoolId],
    enabled,
    staleTime: 2_000,
    refetchInterval: 6_000,
    queryFn: async () => {
      if (!schoolId) return { liveExams: 0, writers: 0 };
      const { data: attempts, error } = await supabase
        .from("exam_attempts")
        .select("id, exam_id, updated_at, started_at, metadata")
        .eq("school_id", schoolId)
        .in("status", ["in_progress"])
        .limit(1000);
      if (error) {
        console.warn("[officer-dash] live attempts", error);
        return { liveExams: 0, writers: 0 };
      }

      const now = Date.now();
      const active = (attempts ?? []).filter((a) =>
        isAttemptActiveNow(
          a as {
            updated_at?: string | null;
            started_at?: string | null;
            metadata?: Record<string, unknown> | null;
          },
          now,
        ),
      );
      // Only exams that currently have active writers (not offline / done / stale)
      const examIds = new Set<string>();
      for (const a of active) {
        const eid = (a as { exam_id: string | null }).exam_id;
        if (eid) examIds.add(eid);
      }
      return { liveExams: examIds.size, writers: active.length };
    },
  });


  const readyToPost = useCount(
    "examinations",
    schoolId
      ? [
          { column: "school_id", value: schoolId },
          { column: "status", value: "approved" },
        ]
      : [],
    enabled,
  );
  // scheduled also ready — combine via lightweight query
  const readyScheduled = useCount(
    "examinations",
    schoolId
      ? [
          { column: "school_id", value: schoolId },
          { column: "status", value: "scheduled" },
        ]
      : [],
    enabled,
  );
  const postQueueValue =
    readyToPost.isLoading || readyScheduled.isLoading
      ? "…"
      : String((readyToPost.data ?? 0) + (readyScheduled.data ?? 0));

  const totalExams = useCount(
    "examinations",
    schoolId ? [{ column: "school_id", value: schoolId }] : [],
    enabled,
  );

  const examsQ = useQuery({
    queryKey: ["officer-dash-exams", schoolId],
    enabled,
    staleTime: 2_000,
    refetchInterval: 8_000,
    queryFn: async () => {
      if (!schoolId) return [] as Exam[];
      const { data, error } = await supabase
        .from("examinations")
        .select("id, title, status, scheduled_start, courses(code)")
        .eq("school_id", schoolId)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) {
        console.warn("[officer-dash] exams", error);
        return [] as Exam[];
      }
      const list = (data ?? []) as Exam[];
      // Pending / changes first, then rest (still by updated_at)
      const rank = (s: string) => {
        const x = (s || "").toLowerCase();
        if (x === "pending_approval") return 0;
        if (x === "changes_requested") return 1;
        if (x === "scheduled" || x === "approved") return 2;
        return 3;
      };
      return [...list].sort((a, b) => rank(a.status) - rank(b.status));
    },
  });
  const exams = { data: examsQ.data, isLoading: examsQ.isLoading };

  type IntegrityRow = {
    id: string;
    event_type: string;
    severity: string | null;
    description: string | null;
    created_at: string;
  };

  const integrityRecent = useRows<IntegrityRow>({
    table: "integrity_events",
    select: "id, event_type, severity, description, created_at",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 10,
    enabled,
  });

  const liveValue = liveStatsQ.isLoading ? "…" : String(liveStatsQ.data?.liveExams ?? 0);
  const integrityValue = liveStatsQ.isLoading ? "…" : String(liveStatsQ.data?.writers ?? 0);

  const integrityQueueQ = useQuery({
    queryKey: ["officer-dash-integrity-queue", schoolId],
    enabled,
    staleTime: 5_000,
    refetchInterval: 12_000,
    queryFn: async () => {
      if (!schoolId) return 0;
      const { data, error } = await supabase
        .from("exam_attempts")
        .select("id, security_review_status")
        .eq("school_id", schoolId)
        .in("status", ["submitted", "completed", "flagged", "graded", "terminated"])
        .limit(250);
      if (error) {
        console.warn("[officer-dash] integrity queue", error.message);
        return 0;
      }
      return (data ?? []).filter((a) => {
        const s = String((a as { security_review_status?: string }).security_review_status || "").toLowerCase();
        return s !== "accepted";
      }).length;
    },
  });
  const integrityQueueValue = integrityQueueQ.isLoading ? "…" : String(integrityQueueQ.data ?? 0);

  return (
    <>
      <PageHeader
        title={`Welcome${user?.fullName ? `, ${user.fullName}` : ", Departmental Officer"}`}
        description={
          user?.schoolName
            ? `${user.schoolName} · Live officer dashboard`
            : "Departmental officer dashboard"
        }
        actions={
          <Button className="font-semibold" asChild>
            <Link to="/officer/approvals">Open approvals</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Stat
          to="/officer/approvals"
          label="Pending approvals"
          value={fmt(pending)}
          icon={CheckSquare}
          color="bg-violet-50 text-violet-600"
        />
        <Stat
          to="/officer/live-monitor"
          label="Live monitoring"
          value={liveValue}
          icon={Radio}
          color="bg-blue-50 text-blue-600"
        />
        <Stat
          to="/officer/integrity"
          label="Integrity queue"
          value={integrityQueueValue}
          icon={ShieldAlert}
          color="bg-amber-50 text-amber-700"
        />
        <Stat
          to="/officer/post-to-students"
          label="Post to students"
          value={postQueueValue}
          icon={Send}
          color="bg-emerald-50 text-emerald-600"
        />
      </div>


      <div
        ref={dashSplitRef}
        className="mt-4 flex flex-row gap-0 sm:mt-6"
        style={{ height: "min(30rem, 58vh)" }}
      >
        <div
          className="flex h-full min-h-0 min-w-0 flex-col"
          style={{ width: `${dashLeftPct}%` }}
        >
        <SectionCard
          className="flex h-full min-h-0 flex-col overflow-hidden"
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
          title="Examinations (pending first)"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/approvals">Approvals</Link>
            </Button>
          }
        >
          {(exams.data ?? []).length === 0 ? (
            <EmptyState
              title="No examinations yet"
              description="When teachers create and submit exams, they appear here."
            />
          ) : (
            <ul className="h-full min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 sm:space-y-2" style={{ WebkitOverflowScrolling: "touch" }}>
              {(exams.data ?? []).map((e) => (
                <li key={e.id}>
                  <NavCard
                    to="/officer/approvals"
                    ariaLabel={`Review ${e.title}`}
                    className="flex items-center justify-between gap-1.5 rounded-lg border-slate-100 px-2 py-1.5 sm:gap-2 sm:rounded-xl sm:px-3.5 sm:py-3 lg:px-4 lg:py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-bold text-slate-900 sm:text-sm lg:text-[15px]">{e.title}</p>
                      <p className="truncate text-[10px] text-slate-500 sm:text-xs lg:text-[13px]">
                        {e.courses?.code ?? "—"} ·{" "}
                        {e.scheduled_start
                          ? new Date(e.scheduled_start).toLocaleString()
                          : "Not scheduled"}
                      </p>
                    </div>
                    <StatusBadge status={String(e.status).replaceAll("_", " ")} />
                  </NavCard>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        </div>
        <SplitHandle
          onPointerDown={(e) => {
            e.preventDefault();
            dashDrag.current = true;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
          onPointerMove={(e) => {
            if (!dashDrag.current || !dashSplitRef.current) return;
            e.preventDefault();
            const rect = dashSplitRef.current.getBoundingClientRect();
            if (rect.width < 40) return;
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            const next = Math.max(28, Math.min(72, pct));
            setDashLeftPct(next);
            setDashStacked(false);
          }}
          onPointerUp={(e) => {
            dashDrag.current = false;
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
        />
        <div
          className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
          style={{ width: `${100 - dashLeftPct}%` }}
        >
        <SectionCard
          className="flex h-full min-h-0 flex-col overflow-hidden"
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
          title="Recent integrity alerts"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/integrity">View all</Link>
            </Button>
          }
        >
          {(integrityRecent.data ?? []).length === 0 ? (
            <EmptyState
              title="No integrity events"
              description="Face, tab, and proctoring alerts from live exams appear here."
            />
          ) : (
            <ul className="h-full min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 sm:space-y-2" style={{ WebkitOverflowScrolling: "touch" }}>
              {(integrityRecent.data ?? []).map((l) => (
                <li key={l.id}>
                  <NavCard
                    to="/officer/integrity"
                    ariaLabel={l.event_type}
                    className="rounded-lg border-slate-100 px-2 py-1.5 sm:rounded-xl sm:px-3.5 sm:py-3 lg:px-4 lg:py-3.5"
                  >
                    <p className="truncate text-[13px] font-semibold text-slate-900 sm:text-sm lg:text-[15px]">
                      {String(l.event_type || "event").replaceAll("_", " ")}
                      {l.severity ? (
                        <span className="ml-2 text-[10px] font-bold uppercase text-amber-700">{l.severity}</span>
                      ) : null}
                    </p>
                    <p className="line-clamp-2 text-[11px] text-slate-500 sm:text-xs lg:text-[13px]">
                      {l.description || "—"} · {new Date(l.created_at).toLocaleString()}
                    </p>
                  </NavCard>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        </div>
      </div>
    </>
  );
}

function fmt(q: { isLoading: boolean; data?: number }) {
  return q.isLoading ? "…" : String(q.data ?? 0);
}

function Stat({
  to,
  label,
  value,
  icon: Icon,
  color,
}: {
  to: string;
  label: string;
  value: string;
  icon: typeof CheckSquare;
  color: string;
}) {
  return (
    <NavCard to={to} ariaLabel={label}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold leading-tight text-slate-500 sm:text-xs">{label}</p>
          <p className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-900 sm:mt-1 sm:text-2xl">{value}</p>
        </div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9 sm:rounded-xl ${color}`}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </span>
      </div>
    </NavCard>
  );
}
