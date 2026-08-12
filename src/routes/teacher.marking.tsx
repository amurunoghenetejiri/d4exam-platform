import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/teacher/marking")({
  head: () => ({
    meta: [
      { title: "Marking Center — D4EXAM" },
      { name: "description", content: "Theory answers awaiting manual marking." },
      { property: "og:title", content: "Marking Center — D4EXAM" },
      { property: "og:description", content: "Theory answers awaiting manual marking." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Marking Center"
      description="Theory answers awaiting manual marking."
      tableTitle="Marking Center"
      columns={[
      { key: "student", header: "Student" },
      { key: "status", header: "Status" },
      ]}
    />
  );
}
