import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";

export const Route = createFileRoute("/teacher/submissions")({
  head: () => ({
    meta: [
      { title: "Submissions — D4EXAM" },
      { name: "description", content: "Candidate submissions awaiting marking or already marked." },
      { property: "og:title", content: "Submissions — D4EXAM" },
      { property: "og:description", content: "Candidate submissions awaiting marking or already marked." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Submissions"
      description="Candidate submissions awaiting marking or already marked."
      tableTitle="Submissions"
      columns={[
      { key: "student", header: "Student" },
      { key: "submitted_at", header: "Submitted" },
      ]}
    />
  );
}
