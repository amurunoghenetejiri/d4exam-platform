import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Faculties"
      description="Academic faculties within your institution."
      stats={[]}
      rows={mock.faculties}
      columns={[{ key: "name", header: "Faculty" }, { key: "dean", header: "Dean", hideOnMobile: true }, { key: "departments", header: "Departments", hideOnMobile: true }, { key: "students", header: "Students" }]}
      tableTitle="Faculties"
    />
  );
}
