import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/admin/levels")({
  head: () => ({
    meta: [
      { title: "Levels — D4EXAM" },
      { name: "description", content: "Academic levels configured for your institution." },
      { property: "og:title", content: "Levels — D4EXAM" },
      { property: "og:description", content: "Academic levels configured for your institution." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Levels"
      description="Academic levels configured for your institution."
      table="levels"
      select="id, name, code, status"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Levels"
      columns={[
      { key: "name", header: "Level" },
      { key: "code", header: "Code", hideOnMobile: true },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
