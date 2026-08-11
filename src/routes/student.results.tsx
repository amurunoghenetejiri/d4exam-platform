import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/student/results")({
  head: () => ({
    meta: [
      { title: "My Results — D4EXAM" },
      { name: "description", content: "Approved and pending results across your academic session." },
      { property: "og:title", content: "My Results — D4EXAM" },
      { property: "og:description", content: "Approved and pending results across your academic session." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="My Results"
      description="Approved and pending results across your academic session."
      stats={[]}
      rows={mock.studentResults}
      columns={[{ key: "course", header: "Course" }, { key: "title", header: "Title", hideOnMobile: true }, { key: "score", header: "Score", render: (r: any) => `${r.score}%` }, { key: "grade", header: "Grade" }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="My Results"
    />
  );
}
