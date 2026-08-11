import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/teacher/integrity")({
  head: () => ({
    meta: [
      { title: "Integrity Monitoring — D4EXAM" },
      { name: "description", content: "Integrity events recorded during your examinations." },
      { property: "og:title", content: "Integrity Monitoring — D4EXAM" },
      { property: "og:description", content: "Integrity events recorded during your examinations." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Integrity Monitoring"
      description="Integrity events recorded during your examinations."
      stats={[]}
      rows={mock.integrityEvents}
      columns={[{ key: "student", header: "Candidate" }, { key: "event", header: "Event" }, { key: "exam", header: "Exam", hideOnMobile: true }, { key: "time", header: "Time", hideOnMobile: true }, { key: "severity", header: "Severity", render: (r: any) => <StatusBadge status={r.severity} /> }]}
      tableTitle="Integrity Monitoring"
    />
  );
}
