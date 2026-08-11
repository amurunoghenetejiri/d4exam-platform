import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/admin/results")({
  head: () => ({
    meta: [
      { title: "Results — D4EXAM" },
      { name: "description", content: "Institution-wide results by course and session." },
      { property: "og:title", content: "Results — D4EXAM" },
      { property: "og:description", content: "Institution-wide results by course and session." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Results"
      description="Institution-wide results by course and session."
      stats={[]}
      rows={mock.studentResults}
      columns={[{ key: "course", header: "Course" }, { key: "title", header: "Title", hideOnMobile: true }, { key: "score", header: "Score", render: (r: any) => `${r.score}%` }, { key: "grade", header: "Grade" }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Results"
    />
  );
}
