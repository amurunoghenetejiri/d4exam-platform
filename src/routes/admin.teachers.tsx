import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/admin/teachers")({
  head: () => ({
    meta: [
      { title: "Teachers — D4EXAM" },
      { name: "description", content: "Teaching staff accounts and assigned courses." },
      { property: "og:title", content: "Teachers — D4EXAM" },
      { property: "og:description", content: "Teaching staff accounts and assigned courses." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Teachers"
      description="Teaching staff accounts and assigned courses."
      stats={[]}
      rows={mock.teachers}
      columns={[{ key: "name", header: "Teacher" }, { key: "staffId", header: "Staff ID" }, { key: "department", header: "Department", hideOnMobile: true }, { key: "courses", header: "Courses", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Teachers"
    />
  );
}
