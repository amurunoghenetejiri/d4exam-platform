import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";

export const Route = createFileRoute("/officer/audit-logs")({
  head: () => ({
    meta: [{ title: "Audit Logs — D4EXAM" }],
  }),
  component: Page,
});

type Log = {
  id: string;
  action: string;
  description: string | null;
  actor_role: string | null;
  created_at: string;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;

  const logs = useRows<Log>({
    table: "audit_logs",
    select: "id, action, description, actor_role, created_at",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 100,
    enabled: Boolean(schoolId),
  });

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="School-scoped actions (approvals, logins, user creates)"
      />

      <SectionCard title="Recent activity">
        {logs.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (logs.data ?? []).length === 0 ? (
          <EmptyState title="No logs yet" description="Officer and admin actions will appear here." />
        ) : (
          <ul className="space-y-3">
            {(logs.data ?? []).map((l) => (
              <li
                key={l.id}
                className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"
              >
                <p className="text-sm font-semibold text-slate-900">{l.action}</p>
                <p className="text-xs text-slate-500">
                  {l.actor_role ?? "—"} · {l.description || "—"} ·{" "}
                  {new Date(l.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
