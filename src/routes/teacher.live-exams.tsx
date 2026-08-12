import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/teacher/live-exams")({
  head: () => ({
    meta: [
      { title: "Live Examinations — D4EXAM" },
      { name: "description", content: "Examinations currently in progress with live candidate counts." },
      { property: "og:title", content: "Live Examinations — D4EXAM" },
      { property: "og:description", content: "Examinations currently in progress with live candidate counts." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Live Examinations"
      description="Examinations currently in progress with live candidate counts."
      tableTitle="Live Examinations"
      columns={[
      { key: "exam", header: "Examination" },
      { key: "status", header: "Status" },
      ]}
    />
  );
}
