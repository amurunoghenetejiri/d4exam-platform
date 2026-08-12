import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

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
    <DbRecordsPage
      title="Subscriptions"
      description="Institution plans, renewals and billing status."
      table="schools"
      select="id, name, school_code, subscription_plan, subscription_status"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Subscriptions"
      columns={[
      { key: "name", header: "School" },
      { key: "school_code", header: "Code", hideOnMobile: true },
      { key: "subscription_plan", header: "Plan" },
      { key: "subscription_status", header: "Status", render: (r: Row) => <StatusBadge status={r.subscription_status} /> },
      ]}
    />
  );
}
