import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/examinations")({
  head: () => ({
    meta: [
      { title: "Examinations — D4EXAM" },
      { name: "description", content: "Draft, scheduled and completed examinations you manage." },
      { property: "og:title", content: "Examinations — D4EXAM" },
      { property: "og:description", content: "Draft, scheduled and completed examinations you manage." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Examinations"
      description="Draft, scheduled and completed examinations you manage."
      stats={[]}
      rows={mock.studentExams}
      columns={[{ key: "code", header: "Code" }, { key: "title", header: "Examination" }, { key: "date", header: "Schedule", hideOnMobile: true }, { key: "questions", header: "Questions", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Examinations"
    />
  );
}
