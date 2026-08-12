import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/admin/semesters")({
  head: () => ({
    meta: [
      { title: "Semesters — D4EXAM" },
      { name: "description", content: "Semester periods within the active academic session." },
      { property: "og:title", content: "Semesters — D4EXAM" },
      { property: "og:description", content: "Semester periods within the active academic session." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Semesters"
      description="Semester periods within the active academic session."
      table="semesters"
      select="id, name, start_date, end_date, status"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Semesters"
      columns={[
      { key: "name", header: "Semester" },
      { key: "start_date", header: "Starts", hideOnMobile: true },
      { key: "end_date", header: "Ends", hideOnMobile: true },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
