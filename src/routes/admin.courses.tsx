import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Courses"
      description="Courses offered across departments and levels."
      stats={[]}
      rows={mock.studentCourses.map((c) => ({ ...c, id: c.code }))}
      columns={[{ key: "code", header: "Code" }, { key: "title", header: "Course title" }, { key: "units", header: "Units", hideOnMobile: true }, { key: "lecturer", header: "Lecturer", hideOnMobile: true }]}
      tableTitle="Courses"
    />
  );
}
