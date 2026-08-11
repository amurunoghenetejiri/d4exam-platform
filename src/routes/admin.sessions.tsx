import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Academic Sessions"
      description="Sessions configured for examinations and results."
      stats={[]}
      rows={[{ id: '1', name: '2025/2026', status: 'active' }, { id: '2', name: '2024/2025', status: 'inactive' }, { id: '3', name: '2023/2024', status: 'inactive' }]}
      columns={[{ key: "name", header: "Session" }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Academic Sessions"
    />
  );
}
