import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="School Applications"
      description="New institutions awaiting verification and approval."
      stats={[]}
      rows={mock.schoolApplications}
      columns={[{ key: "name", header: "Institution" }, { key: "country", header: "Country", hideOnMobile: true }, { key: "contact", header: "Contact", hideOnMobile: true }, { key: "date", header: "Submitted" }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="School Applications"
    />
  );
}
