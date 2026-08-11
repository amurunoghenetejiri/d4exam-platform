import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/admin/students")({
  head: () => ({
    meta: [
      { title: "Students — D4EXAM" },
      { name: "description", content: "Search, filter and manage student records." },
      { property: "og:title", content: "Students — D4EXAM" },
      { property: "og:description", content: "Search, filter and manage student records." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Students"
      description="Search, filter and manage student records."
      stats={[]}
      rows={mock.students}
      columns={[{ key: "name", header: "Student" }, { key: "matric", header: "Matric" }, { key: "department", header: "Department", hideOnMobile: true }, { key: "level", header: "Level", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Students"
    />
  );
}
