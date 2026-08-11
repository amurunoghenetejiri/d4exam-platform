import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Marking Center"
      description="Theory answers awaiting manual marking."
      stats={[]}
      rows={mock.submissions.filter((s) => s.status !== 'marked')}
      columns={[{ key: "student", header: "Candidate" }, { key: "exam", header: "Exam" }, { key: "submitted", header: "Submitted", hideOnMobile: true }, { key: "objective", header: "Objective", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Marking Center"
    />
  );
}
