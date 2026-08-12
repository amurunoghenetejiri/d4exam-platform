import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

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
    <DbRecordsPage
      title="Students"
      description="Search, filter and manage student records."
      table="students"
      select="id, student_id, matric_number, status, profiles(full_name), departments(name), levels(name)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Students"
      columns={[
      { key: "student", header: "Student", render: (r: Row) => r.profiles?.full_name ?? "—" },
      { key: "matric_number", header: "Matric", render: (r: Row) => r.matric_number ?? r.student_id },
      { key: "department", header: "Department", hideOnMobile: true, render: (r: Row) => r.departments?.name ?? "—" },
      { key: "level", header: "Level", hideOnMobile: true, render: (r: Row) => r.levels?.name ?? "—" },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
