import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

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
    <DbRecordsPage
      title="My Examinations"
      description="Scheduled, ongoing and completed examinations for your registered courses."
      table="examinations"
      select="id, title, status, duration_minutes, scheduled_start, courses(code)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="My Examinations"
      columns={[
      { key: "course", header: "Course", render: (r: Row) => r.courses?.code ?? "—" },
      { key: "title", header: "Examination" },
      { key: "scheduled_start", header: "Scheduled", hideOnMobile: true, render: (r: Row) => (r.scheduled_start ? new Date(r.scheduled_start).toLocaleString() : "Not scheduled") },
      { key: "duration_minutes", header: "Duration", hideOnMobile: true, render: (r: Row) => `${r.duration_minutes} min` },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
