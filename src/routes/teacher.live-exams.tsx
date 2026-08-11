import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/live-exams")({
  head: () => ({
    meta: [
      { title: "Live Examinations — D4EXAM" },
      { name: "description", content: "Examinations currently in progress with live candidate counts." },
      { property: "og:title", content: "Live Examinations — D4EXAM" },
      { property: "og:description", content: "Examinations currently in progress with live candidate counts." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Live Examinations"
      description="Examinations currently in progress with live candidate counts."
      stats={[]}
      rows={mock.studentExams.filter((e) => e.status === 'ongoing')}
      columns={[{ key: "code", header: "Code" }, { key: "title", header: "Examination" }, { key: "date", header: "Schedule", hideOnMobile: true }, { key: "questions", header: "Questions", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Live Examinations"
    />
  );
}
