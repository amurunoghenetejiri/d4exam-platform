import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Platform Users"
      description="Staff and administrator accounts across all institutions."
      stats={[]}
      rows={mock.teachers}
      columns={[{ key: "name", header: "Teacher" }, { key: "staffId", header: "Staff ID" }, { key: "department", header: "Department", hideOnMobile: true }, { key: "courses", header: "Courses", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Platform Users"
    />
  );
}
