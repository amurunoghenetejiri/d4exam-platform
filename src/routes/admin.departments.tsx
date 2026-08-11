import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Departments"
      description="Departments grouped under each faculty."
      stats={[]}
      rows={mock.departments}
      columns={[{ key: "name", header: "Department" }, { key: "faculty", header: "Faculty", hideOnMobile: true }, { key: "hod", header: "Head of Dept", hideOnMobile: true }, { key: "students", header: "Students" }]}
      tableTitle="Departments"
    />
  );
}
