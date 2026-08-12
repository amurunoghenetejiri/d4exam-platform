import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/teacher/integrity")({
  head: () => ({
    meta: [
      { title: "Integrity Monitoring — D4EXAM" },
      { name: "description", content: "Integrity events recorded during your examinations." },
      { property: "og:title", content: "Integrity Monitoring — D4EXAM" },
      { property: "og:description", content: "Integrity events recorded during your examinations." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Integrity Monitoring"
      description="Integrity events recorded during your examinations."
      tableTitle="Integrity Monitoring"
      columns={[
      { key: "event", header: "Event" },
      { key: "created_at", header: "When" },
      ]}
    />
  );
}
