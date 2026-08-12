import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

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
    <DbRecordsPage
      title="Examinations"
      description="Draft, scheduled and completed examinations you manage."
      table="examinations"
      select="id, title, status, duration_minutes, scheduled_start, courses(code)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Examinations"
      columns={[
      { key: "course", header: "Course", render: (r: Row) => r.courses?.code ?? "—" },
      { key: "title", header: "Examination" },
      { key: "scheduled_start", header: "Scheduled", hideOnMobile: true, render: (r: Row) => (r.scheduled_start ? new Date(r.scheduled_start).toLocaleString() : "Not scheduled") },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
