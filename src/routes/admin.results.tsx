import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/admin/results")({
  head: () => ({
    meta: [
      { title: "Results — D4EXAM" },
      { name: "description", content: "Institution-wide results by course and session." },
      { property: "og:title", content: "Results — D4EXAM" },
      { property: "og:description", content: "Institution-wide results by course and session." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Results"
      description="Institution-wide results by course and session."
      tableTitle="Results"
      columns={[
      { key: "course", header: "Course" },
      { key: "score", header: "Score" },
      { key: "status", header: "Status" },
      ]}
    />
  );
}
