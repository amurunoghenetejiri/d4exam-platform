import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Users"
      description="All staff and candidate accounts in your institution."
      stats={[]}
      rows={mock.teachers}
      columns={[{ key: "name", header: "Teacher" }, { key: "staffId", header: "Staff ID" }, { key: "department", header: "Department", hideOnMobile: true }, { key: "courses", header: "Courses", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Users"
    />
  );
}
