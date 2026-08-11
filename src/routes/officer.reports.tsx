import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/officer/reports")({
  head: () => ({
    meta: [
      { title: "Reports — D4EXAM" },
      { name: "description", content: "Examination and integrity reports for the institution." },
      { property: "og:title", content: "Reports — D4EXAM" },
      { property: "og:description", content: "Examination and integrity reports for the institution." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Reports"
      description="Examination and integrity reports for the institution."
      stats={[]}
      rows={mock.studentResults}
      columns={[{ key: "course", header: "Course" }, { key: "title", header: "Title", hideOnMobile: true }, { key: "score", header: "Score", render: (r: any) => `${r.score}%` }, { key: "grade", header: "Grade" }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Reports"
    />
  );
}
