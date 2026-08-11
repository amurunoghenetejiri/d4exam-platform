import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/officer/results")({
  head: () => ({
    meta: [
      { title: "Result Approval — D4EXAM" },
      { name: "description", content: "Results awaiting approval and publication." },
      { property: "og:title", content: "Result Approval — D4EXAM" },
      { property: "og:description", content: "Results awaiting approval and publication." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Result Approval"
      description="Results awaiting approval and publication."
      stats={[]}
      rows={mock.studentResults}
      columns={[{ key: "course", header: "Course" }, { key: "title", header: "Title", hideOnMobile: true }, { key: "score", header: "Score", render: (r: any) => `${r.score}%` }, { key: "grade", header: "Grade" }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Result Approval"
    />
  );
}
