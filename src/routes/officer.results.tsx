import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/officer/results")({
  head: () => ({
    meta: [
      { title: "Result Approval — D4EXAM" },
      { name: "description", content: "Results awaiting approval and publication." },
      { property: "og:title", content: "Result Approval — D4EXAM" },
      { property: "og:description", content: "Results awaiting approval and publication." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Result Approval"
      description="Results awaiting approval and publication."
      tableTitle="Result Approval"
      columns={[
      { key: "course", header: "Course" },
      { key: "status", header: "Status" },
      ]}
    />
  );
}
