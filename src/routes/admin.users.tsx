import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — D4EXAM" },
      { name: "description", content: "All staff and candidate accounts in your institution." },
      { property: "og:title", content: "Users — D4EXAM" },
      { property: "og:description", content: "All staff and candidate accounts in your institution." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Users"
      description="All staff and candidate accounts in your institution."
      table="profiles"
      select="id, full_name, email, status"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Users"
      columns={[
      { key: "full_name", header: "Name" },
      { key: "email", header: "Email", hideOnMobile: true },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
