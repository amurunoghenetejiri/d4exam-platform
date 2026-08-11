import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/results")({
  head: () => ({
    meta: [
      { title: "Results — D4EXAM" },
      { name: "description", content: "Computed results for your courses before officer approval." },
      { property: "og:title", content: "Results — D4EXAM" },
      { property: "og:description", content: "Computed results for your courses before officer approval." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Results"
      description="Computed results for your courses before officer approval."
      stats={[]}
      rows={mock.studentResults}
      columns={[{ key: "course", header: "Course" }, { key: "title", header: "Title", hideOnMobile: true }, { key: "score", header: "Score", render: (r: any) => `${r.score}%` }, { key: "grade", header: "Grade" }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Results"
    />
  );
}
