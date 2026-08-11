import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/super-admin/reports")({
  head: () => ({
    meta: [
      { title: "Platform Reports — D4EXAM" },
      { name: "description", content: "Usage, delivery and growth reporting across institutions." },
      { property: "og:title", content: "Platform Reports — D4EXAM" },
      { property: "og:description", content: "Usage, delivery and growth reporting across institutions." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Platform Reports"
      description="Usage, delivery and growth reporting across institutions."
      stats={[]}
      rows={mock.schools}
      columns={[{ key: "name", header: "School" }, { key: "code", header: "Code" }, { key: "country", header: "Country", hideOnMobile: true }, { key: "students", header: "Students", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Platform Reports"
    />
  );
}
