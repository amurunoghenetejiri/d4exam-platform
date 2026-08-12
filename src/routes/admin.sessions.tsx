import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/admin/sessions")({
  head: () => ({
    meta: [
      { title: "Academic Sessions — D4EXAM" },
      { name: "description", content: "Sessions configured for examinations and results." },
      { property: "og:title", content: "Academic Sessions — D4EXAM" },
      { property: "og:description", content: "Sessions configured for examinations and results." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Academic Sessions"
      description="Sessions configured for examinations and results."
      table="academic_sessions"
      select="id, name, start_date, end_date, status"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Academic Sessions"
      columns={[
      { key: "name", header: "Session" },
      { key: "start_date", header: "Starts", hideOnMobile: true },
      { key: "end_date", header: "Ends", hideOnMobile: true },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
