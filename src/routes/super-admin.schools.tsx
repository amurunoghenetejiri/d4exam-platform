import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/super-admin/schools")({
  head: () => ({
    meta: [
      { title: "Schools — D4EXAM" },
      { name: "description", content: "Institutions onboarded onto the D4EXAM platform." },
      { property: "og:title", content: "Schools — D4EXAM" },
      { property: "og:description", content: "Institutions onboarded onto the D4EXAM platform." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Schools"
      description="Institutions onboarded onto the D4EXAM platform."
      table="schools"
      select="id, name, school_code, country, subscription_plan, status"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Schools"
      columns={[
      { key: "name", header: "School" },
      { key: "school_code", header: "Code" },
      { key: "country", header: "Country", hideOnMobile: true },
      { key: "subscription_plan", header: "Plan", hideOnMobile: true },
      { key: "status", header: "Status", render: (r: Row) => <StatusBadge status={r.status} /> },
      ]}
    />
  );
}
