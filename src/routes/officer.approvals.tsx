import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

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
    <DbRecordsPage
      title="Examination Approvals"
      description="Examinations awaiting officer approval before delivery."
      table="examinations"
      select="id, title, status, scheduled_start, courses(code)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Examination Approvals"
      columns={[
      { key: "course", header: "Course", render: (r: Row) => r.courses?.code ?? "—" },
      { key: "title", header: "Examination" },
      { key: "scheduled_start", header: "Scheduled", hideOnMobile: true, render: (r: Row) => (r.scheduled_start ? new Date(r.scheduled_start).toLocaleString() : "Not scheduled") },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
