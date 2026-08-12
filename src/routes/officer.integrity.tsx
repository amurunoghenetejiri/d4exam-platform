import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/officer/integrity")({
  head: () => ({
    meta: [
      { title: "Integrity Review — D4EXAM" },
      { name: "description", content: "Flagged attempts and recorded integrity events." },
      { property: "og:title", content: "Integrity Review — D4EXAM" },
      { property: "og:description", content: "Flagged attempts and recorded integrity events." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Integrity Review"
      description="Flagged attempts and recorded integrity events."
      tableTitle="Integrity Review"
      columns={[
      { key: "event", header: "Event" },
      { key: "created_at", header: "When" },
      ]}
    />
  );
}
