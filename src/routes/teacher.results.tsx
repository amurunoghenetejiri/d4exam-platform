import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/teacher/results")({
  head: () => ({
    meta: [
      { title: "Results — D4EXAM" },
      { name: "description", content: "Computed results for your courses before officer approval." },
      { property: "og:title", content: "Results — D4EXAM" },
      { property: "og:description", content: "Computed results for your courses before officer approval." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Results"
      description="Computed results for your courses before officer approval."
      tableTitle="Results"
      columns={[
      { key: "course", header: "Course" },
      { key: "status", header: "Status" },
      ]}
    />
  );
}
