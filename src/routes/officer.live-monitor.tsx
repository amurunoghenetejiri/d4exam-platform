import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/officer/live-monitor")({
  head: () => ({
    meta: [
      { title: "Live Monitor — D4EXAM" },
      { name: "description", content: "Examinations in progress and live candidate activity." },
      { property: "og:title", content: "Live Monitor — D4EXAM" },
      { property: "og:description", content: "Examinations in progress and live candidate activity." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Live Monitor"
      description="Examinations in progress and live candidate activity."
      tableTitle="Live Monitor"
      columns={[
      { key: "exam", header: "Examination" },
      { key: "status", header: "Status" },
      ]}
    />
  );
}
