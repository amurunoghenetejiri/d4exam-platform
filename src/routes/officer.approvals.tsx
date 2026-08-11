import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/officer/approvals")({
  head: () => ({
    meta: [
      { title: "Examination Approvals — D4EXAM" },
      { name: "description", content: "Examinations awaiting officer approval before delivery." },
      { property: "og:title", content: "Examination Approvals — D4EXAM" },
      { property: "og:description", content: "Examinations awaiting officer approval before delivery." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Examination Approvals"
      description="Examinations awaiting officer approval before delivery."
      stats={[]}
      rows={mock.studentExams}
      columns={[{ key: "code", header: "Code" }, { key: "title", header: "Examination" }, { key: "date", header: "Schedule", hideOnMobile: true }, { key: "questions", header: "Questions", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Examination Approvals"
    />
  );
}
