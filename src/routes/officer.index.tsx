import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState, NavCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { CheckSquare, Radio, FileText, ShieldAlert } from "lucide-react";
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
const ACTIVE_WRITER_MS = 4 * 60 * 60 * 1000;

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
      ["rows", "examinations"],
      ["rows", "audit_logs"],
    ],
    enabled,
    2000,
  );

  const pending = useCount(
    "examinations",
    schoolId
      ? [
          { column: "school_id", value: schoolId },
          { column: "status", value: "pending_approval" },
        ]
      : [],
    enabled,
  );

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
        .in("status", ["in_progress", "paused", "held", "active"])
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
      const examIds = new Set<string>();
      for (const a of active) {
        const eid = (a as { exam_id: string | null }).exam_id;
        if (eid) examIds.add(eid);
      }
      let ongoingCount = 0;
      try {
        const { count } = await supabase
          .from("examinations")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("status", "ongoing");
        ongoingCount = count ?? 0;
      } catch {
        /* ignore */
      }
      let liveExams = examIds.size;
      if (liveExams === 0 && active.length > 0) liveExams = Math.max(1, ongoingCount);
      else if (ongoingCount > liveExams && active.length > 0) liveExams = Math.max(liveExams, ongoingCount);
      return { liveExams, writers: active.length };
    },
  });

  const totalExams = useCount(
    "examinations",
    schoolId ? [{ column: "school_id", value: schoolId }] : [],
    enabled,
  );

  const exams = useRows<Exam>({
    table: "examinations",
    select: "id, title, status, scheduled_start, courses(code)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 8,
    enabled,
  });

  const logs = useRows<Audit>({
    table: "audit_logs",
    select: "id, action, description, created_at",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 6,
    enabled,
  });

  const liveValue = liveStatsQ.isLoading ? "…" : String(liveStatsQ.data?.liveExams ?? 0);
  const integrityValue = liveStatsQ.isLoading ? "…" : String(liveStatsQ.data?.writers ?? 0);

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
          label="Live examinations"
          value={liveValue}
          icon={Radio}
          color="bg-blue-50 text-blue-600"
        />
        <Stat
          to="/officer/approvals"
          label="Total exams"
          value={fmt(totalExams)}
          icon={FileText}
          color="bg-slate-100 text-slate-700"
        />
        <Stat
          to="/officer/integrity"
          label="Ongoing (integrity)"
          value={integrityValue}
          icon={ShieldAlert}
          color="bg-red-50 text-red-600"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
        <SectionCard
          title="School examinations"
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
            <ul className="max-h-[10.5rem] space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 sm:max-h-[12rem] sm:space-y-2">
              {(exams.data ?? []).map((e) => (
                <li key={e.id}>
                  <NavCard
                    to="/officer/approvals"
                    ariaLabel={`Review ${e.title}`}
                    className="flex items-center justify-between gap-2 rounded-lg border-slate-100 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-slate-900 sm:text-sm">{e.title}</p>
                      <p className="truncate text-[11px] text-slate-500 sm:text-xs">
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

        <SectionCard
          title="Recent audit activity"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/audit-logs">View all</Link>
            </Button>
          }
        >
          {(logs.data ?? []).length === 0 ? (
            <EmptyState
              title="No audit logs"
              description="Approve/reject actions will appear here."
            />
          ) : (
            <ul className="max-h-[10.5rem] space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 sm:max-h-[12rem] sm:space-y-2">
              {(logs.data ?? []).map((l) => (
                <li key={l.id}>
                  <NavCard
                    to="/officer/audit-logs"
                    ariaLabel={l.action}
                    className="rounded-lg border-slate-100 px-2.5 py-2 sm:rounded-xl sm:px-3 sm:py-2.5"
                  >
                    <p className="truncate text-[13px] font-semibold text-slate-900 sm:text-sm">{l.action}</p>
                    <p className="line-clamp-1 text-[11px] text-slate-500 sm:text-xs">
                      {l.description || "—"} · {new Date(l.created_at).toLocaleString()}
                    </p>
                  </NavCard>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
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
