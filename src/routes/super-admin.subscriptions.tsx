import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/super-admin/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions — D4EXAM" },
      { name: "description", content: "Institution plans, renewals and billing status." },
      { property: "og:title", content: "Subscriptions — D4EXAM" },
      { property: "og:description", content: "Institution plans, renewals and billing status." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Subscriptions"
      description="Institution plans, renewals and billing status."
      stats={[]}
      rows={mock.schools}
      columns={[{ key: "name", header: "School" }, { key: "code", header: "Code" }, { key: "country", header: "Country", hideOnMobile: true }, { key: "students", header: "Students", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Subscriptions"
    />
  );
}
