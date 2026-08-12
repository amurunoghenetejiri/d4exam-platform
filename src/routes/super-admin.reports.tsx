import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/super-admin/reports")({
  head: () => ({
    meta: [
      { title: "Platform Reports — D4EXAM" },
      { name: "description", content: "Usage, delivery and growth reporting across institutions." },
      { property: "og:title", content: "Platform Reports — D4EXAM" },
      { property: "og:description", content: "Usage, delivery and growth reporting across institutions." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Platform Reports"
      description="Usage, delivery and growth reporting across institutions."
      tableTitle="Platform Reports"
      columns={[
      { key: "name", header: "Report" },
      ]}
    />
  );
}
