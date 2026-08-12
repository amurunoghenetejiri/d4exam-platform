import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/admin/courses")({
  head: () => ({
    meta: [
      { title: "Courses — D4EXAM" },
      { name: "description", content: "Courses offered across departments and levels." },
      { property: "og:title", content: "Courses — D4EXAM" },
      { property: "og:description", content: "Courses offered across departments and levels." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Courses"
      description="Courses offered across departments and levels."
      table="courses"
      select="id, code, name, credit_units, status, departments(name)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Courses"
      columns={[
      { key: "code", header: "Code" },
      { key: "name", header: "Course" },
      { key: "department", header: "Department", hideOnMobile: true, render: (r: Row) => r.departments?.name ?? "—" },
      { key: "credit_units", header: "Units", hideOnMobile: true },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
