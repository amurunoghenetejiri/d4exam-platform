import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/admin/faculties")({
  head: () => ({
    meta: [
      { title: "Faculties — D4EXAM" },
      { name: "description", content: "Academic faculties within your institution." },
      { property: "og:title", content: "Faculties — D4EXAM" },
      { property: "og:description", content: "Academic faculties within your institution." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Faculties"
      description="Academic faculties within your institution."
      table="faculties"
      select="id, name, code, status"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Faculties"
      columns={[
      { key: "name", header: "Faculty" },
      { key: "code", header: "Code", hideOnMobile: true },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
