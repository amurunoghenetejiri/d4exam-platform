import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/teacher/exam-security")({
  head: () => ({
    meta: [
      { title: "Exam Security — D4EXAM" },
      { name: "description", content: "Security configuration applied to each examination." },
      { property: "og:title", content: "Exam Security — D4EXAM" },
      { property: "og:description", content: "Security configuration applied to each examination." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Exam Security"
      description="Security configuration applied to each examination."
      tableTitle="Exam Security"
      columns={[
      { key: "setting", header: "Security setting" },
      { key: "status", header: "Status" },
      ]}
    />
  );
}
