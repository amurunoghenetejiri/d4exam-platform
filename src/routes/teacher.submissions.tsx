import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Submissions"
      description="Candidate submissions awaiting marking or already marked."
      stats={[]}
      rows={mock.submissions}
      columns={[{ key: "student", header: "Candidate" }, { key: "exam", header: "Exam" }, { key: "submitted", header: "Submitted", hideOnMobile: true }, { key: "objective", header: "Objective", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Submissions"
    />
  );
}
