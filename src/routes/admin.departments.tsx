import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/admin/departments")({
  head: () => ({
    meta: [
      { title: "Departments — D4EXAM" },
      { name: "description", content: "Departments grouped under each faculty." },
      { property: "og:title", content: "Departments — D4EXAM" },
      { property: "og:description", content: "Departments grouped under each faculty." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Departments"
      description="Departments grouped under each faculty."
      table="departments"
      select="id, name, code, status, faculties(name)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Departments"
      columns={[
      { key: "name", header: "Department" },
      { key: "code", header: "Code", hideOnMobile: true },
      { key: "faculty", header: "Faculty", hideOnMobile: true, render: (r: Row) => r.faculties?.name ?? "—" },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
