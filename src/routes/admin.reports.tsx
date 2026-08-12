import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "Reports — D4EXAM" },
      { name: "description", content: "Participation, performance and integrity reports." },
      { property: "og:title", content: "Reports — D4EXAM" },
      { property: "og:description", content: "Participation, performance and integrity reports." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Reports"
      description="Participation, performance and integrity reports."
      tableTitle="Reports"
      columns={[
      { key: "name", header: "Report" },
      { key: "created_at", header: "Generated" },
      ]}
    />
  );
}
