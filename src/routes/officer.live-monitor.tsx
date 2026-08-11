import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/officer/live-monitor")({
  head: () => ({
    meta: [
      { title: "Live Monitor — D4EXAM" },
      { name: "description", content: "Examinations in progress and live candidate activity." },
      { property: "og:title", content: "Live Monitor — D4EXAM" },
      { property: "og:description", content: "Examinations in progress and live candidate activity." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Live Monitor"
      description="Examinations in progress and live candidate activity."
      stats={[]}
      rows={mock.studentExams.filter((e) => e.status === 'ongoing')}
      columns={[{ key: "code", header: "Code" }, { key: "title", header: "Examination" }, { key: "date", header: "Schedule", hideOnMobile: true }, { key: "questions", header: "Questions", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Live Monitor"
    />
  );
}
