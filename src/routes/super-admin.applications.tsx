import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/super-admin/applications")({
  head: () => ({
    meta: [
      { title: "School Applications — D4EXAM" },
      { name: "description", content: "New institutions awaiting verification and approval." },
      { property: "og:title", content: "School Applications — D4EXAM" },
      { property: "og:description", content: "New institutions awaiting verification and approval." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="School Applications"
      description="New institutions awaiting verification and approval."
      table="school_applications"
      select="id, school_name, country, applicant_email, status, created_at"
      order={{ column: "created_at", ascending: false }}
      tableTitle="School Applications"
      columns={[
      { key: "school_name", header: "School" },
      { key: "country", header: "Country", hideOnMobile: true },
      { key: "applicant_email", header: "Contact", hideOnMobile: true },
      { key: "created_at", header: "Received", hideOnMobile: true, render: (r: Row) => new Date(r.created_at).toLocaleDateString() },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
