import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/exam-security")({
  head: () => ({
    meta: [
      { title: "Exam Security — D4EXAM" },
      { name: "description", content: "Security configuration applied to each examination." },
      { property: "og:title", content: "Exam Security — D4EXAM" },
      { property: "og:description", content: "Security configuration applied to each examination." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Exam Security"
      description="Security configuration applied to each examination."
      stats={[]}
      rows={mock.studentExams}
      columns={[{ key: "code", header: "Code" }, { key: "title", header: "Examination" }, { key: "date", header: "Schedule", hideOnMobile: true }, { key: "questions", header: "Questions", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Exam Security"
    />
  );
}
