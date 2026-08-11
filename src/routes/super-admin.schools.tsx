import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Schools"
      description="Institutions onboarded onto the D4EXAM platform."
      stats={[]}
      rows={mock.schools}
      columns={[{ key: "name", header: "School" }, { key: "code", header: "Code" }, { key: "country", header: "Country", hideOnMobile: true }, { key: "students", header: "Students", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Schools"
    />
  );
}
