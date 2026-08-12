import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/student/results")({
  head: () => ({
    meta: [
      { title: "My Results — D4EXAM" },
      { name: "description", content: "Approved and pending results across your academic session." },
      { property: "og:title", content: "My Results — D4EXAM" },
      { property: "og:description", content: "Approved and pending results across your academic session." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="My Results"
      description="Approved and pending results across your academic session."
      tableTitle="My Results"
      columns={[
      { key: "course", header: "Course" },
      { key: "score", header: "Score" },
      { key: "grade", header: "Grade" },
      { key: "status", header: "Status" },
      ]}
    />
  );
}
