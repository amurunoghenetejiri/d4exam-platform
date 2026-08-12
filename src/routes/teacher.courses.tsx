import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/teacher/courses")({
  head: () => ({
    meta: [
      { title: "My Courses — D4EXAM" },
      { name: "description", content: "Courses you teach this semester and their examination activity." },
      { property: "og:title", content: "My Courses — D4EXAM" },
      { property: "og:description", content: "Courses you teach this semester and their examination activity." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="My Courses"
      description="Courses you teach this semester and their examination activity."
      table="teacher_courses"
      select="id, courses(code, name, credit_units)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="My Courses"
      columns={[
      { key: "code", header: "Code", render: (r: Row) => r.courses?.code ?? "—" },
      { key: "name", header: "Course", render: (r: Row) => r.courses?.name ?? "—" },
      { key: "credit_units", header: "Units", hideOnMobile: true, render: (r: Row) => r.courses?.credit_units ?? "—" },
      ]}
    />
  );
}
