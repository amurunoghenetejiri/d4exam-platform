import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/student/examinations")({
  head: () => ({
    meta: [
      { title: "My Examinations — D4EXAM" },
      { name: "description", content: "Scheduled, ongoing and completed examinations for your registered courses." },
      { property: "og:title", content: "My Examinations — D4EXAM" },
      { property: "og:description", content: "Scheduled, ongoing and completed examinations for your registered courses." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="My Examinations"
      description="Scheduled, ongoing and completed examinations for your registered courses."
      stats={[]}
      rows={mock.studentExams}
      columns={[{ key: "code", header: "Code" }, { key: "title", header: "Examination" }, { key: "date", header: "Schedule", hideOnMobile: true }, { key: "questions", header: "Questions", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="My Examinations"
    />
  );
}
