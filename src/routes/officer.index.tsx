import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { CheckSquare, Radio, FileText, ShieldAlert } from "lucide-react";
import { useCount, useRows } from "@/lib/queries";
import { useSessionUser } from "@/lib/session";

export const Route = createFileRoute("/officer/")({
  head: () => ({
    meta: [{ title: "Examination Officer Dashboard — D4EXAM" }],
  }),
  component: Page,
});

type Exam = {
  id: string;
  title: string;
  status: string;
  scheduled_start: string | null;
};

type Audit = {
  id: string;
  action: string;
  description: string | null;
  created_at: string;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const enabled = Boolean(schoolId);

  const pending = useCount(
    "examinations",
    schoolId
      ? [
          { column: "school_id", value: schoolId },
          { column: "status", value: "pending" },
        ]
      : [],
    enabled,
  );
  const live = useCount(
    "examinations",
    schoolId
      ? [
          { column: "school_id", value: schoolId },
          { column: "status", value: "ongoing" },
        ]
      : [],
    enabled,
  );
  const totalExams = useCount("examinations", schoolId ? [{ column: "school_id", value: schoolId }] : [], enabled);

  const exams = useRows<Exam>({
    table: "examinations",
    select: "id, title, status, scheduled_start",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 6,
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

  return (
    <>
      <PageHeader
        title={`Welcome${user?.fullName ? `, ${user.fullName}` : ", Examination Officer"}`}
        description={user?.schoolName ? `${user.schoolName} · Officer` : "Examination officer dashboard"}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Pending approvals" value={fmt(pending)} icon={CheckSquare} color="bg-violet-50 text-violet-600" />
        <Stat label="Live examinations" value={fmt(live)} icon={Radio} color="bg-blue-50 text-blue-600" />
        <Stat label="Total exams" value={fmt(totalExams)} icon={FileText} color="bg-slate-100 text-slate-700" />
        <Stat label="Integrity focus" value={fmt(live)} icon={ShieldAlert} color="bg-red-50 text-red-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Examinations"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/approvals">Approvals</Link>
            </Button>
          }
        >
          {(exams.data ?? []).length === 0 ? (
            <EmptyState title="No examinations" description="School examinations will appear here." />
          ) : (
            <ul className="space-y-3">
              {(exams.data ?? []).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.scheduled_start ? new Date(e.scheduled_start).toLocaleString() : "Not scheduled"}
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent audit activity"
          action={
            <Button variant="ghost" size="sm" className="font-semibold text-primary" asChild>
              <Link to="/officer/audit-logs">View All</Link>
            </Button>
          }
        >
          {(logs.data ?? []).length === 0 ? (
            <EmptyState title="No audit logs" description="Officer and admin actions will appear here." />
          ) : (
            <ul className="space-y-3">
              {(logs.data ?? []).map((l) => (
                <li key={l.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-semibold text-slate-900">{l.action}</p>
                  <p className="text-xs text-slate-500">
                    {l.description || "—"} · {new Date(l.created_at).toLocaleString()}
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

function fmt(q: { isLoading: boolean; data?: number }) {
  return q.isLoading ? "…" : String(q.data ?? 0);
}

function Stat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
