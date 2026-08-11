import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/officer/integrity")({
  head: () => ({
    meta: [
      { title: "Integrity Review — D4EXAM" },
      { name: "description", content: "Flagged attempts and recorded integrity events." },
      { property: "og:title", content: "Integrity Review — D4EXAM" },
      { property: "og:description", content: "Flagged attempts and recorded integrity events." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Integrity Review"
      description="Flagged attempts and recorded integrity events."
      stats={[]}
      rows={mock.integrityEvents}
      columns={[{ key: "student", header: "Candidate" }, { key: "event", header: "Event" }, { key: "exam", header: "Exam", hideOnMobile: true }, { key: "time", header: "Time", hideOnMobile: true }, { key: "severity", header: "Severity", render: (r: any) => <StatusBadge status={r.severity} /> }]}
      tableTitle="Integrity Review"
    />
  );
}
