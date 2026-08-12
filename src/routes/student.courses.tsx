import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/student/courses")({
  head: () => ({
    meta: [
      { title: "My Courses — D4EXAM" },
      { name: "description", content: "Courses registered for the current semester." },
      { property: "og:title", content: "My Courses — D4EXAM" },
      { property: "og:description", content: "Courses registered for the current semester." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="My Courses"
      description="Courses registered for the current semester."
      table="student_courses"
      select="id, status, courses(code, name, credit_units)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="My Courses"
      columns={[
      { key: "code", header: "Code", render: (r: Row) => r.courses?.code ?? "—" },
      { key: "name", header: "Course", render: (r: Row) => r.courses?.name ?? "—" },
      { key: "credit_units", header: "Units", hideOnMobile: true, render: (r: Row) => r.courses?.credit_units ?? "—" },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
