import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/super-admin/users")({
  head: () => ({
    meta: [
      { title: "Platform Users — D4EXAM" },
      { name: "description", content: "Staff and administrator accounts across all institutions." },
      { property: "og:title", content: "Platform Users — D4EXAM" },
      { property: "og:description", content: "Staff and administrator accounts across all institutions." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Platform Users"
      description="Staff and administrator accounts across all institutions."
      table="profiles"
      select="id, full_name, email, status"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Platform Users"
      columns={[
      { key: "full_name", header: "Name" },
      { key: "email", header: "Email", hideOnMobile: true },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
