import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="My Courses"
      description="Courses registered for the current semester."
      stats={[]}
      rows={mock.studentCourses.map((c) => ({ ...c, id: c.code }))}
      columns={[{ key: "code", header: "Code" }, { key: "title", header: "Course title" }, { key: "units", header: "Units", hideOnMobile: true }, { key: "lecturer", header: "Lecturer", hideOnMobile: true }]}
      tableTitle="My Courses"
    />
  );
}
