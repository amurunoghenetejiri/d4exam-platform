import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/officer/reports")({
  head: () => ({
    meta: [
      { title: "Reports — D4EXAM" },
      { name: "description", content: "Examination and integrity reports for the institution." },
      { property: "og:title", content: "Reports — D4EXAM" },
      { property: "og:description", content: "Examination and integrity reports for the institution." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Reports"
      description="Examination and integrity reports for the institution."
      tableTitle="Reports"
      columns={[
      { key: "name", header: "Report" },
      ]}
    />
  );
}
