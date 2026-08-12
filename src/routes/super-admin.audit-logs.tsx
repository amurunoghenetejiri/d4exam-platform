import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/super-admin/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — D4EXAM" },
      { name: "description", content: "Platform-level administrative activity." },
      { property: "og:title", content: "Audit Logs — D4EXAM" },
      { property: "og:description", content: "Platform-level administrative activity." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Audit Logs"
      description="Platform-level administrative activity."
      table="audit_logs"
      select="id, action, entity_type, description, created_at"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Audit Logs"
      columns={[
      { key: "action", header: "Action" },
      { key: "entity_type", header: "Entity", hideOnMobile: true },
      { key: "description", header: "Description", hideOnMobile: true },
      { key: "created_at", header: "When", render: (r: Row) => new Date(r.created_at).toLocaleString() },
      ]}
    />
  );
}
