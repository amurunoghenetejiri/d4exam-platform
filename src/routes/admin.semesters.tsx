import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

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
    <RecordsPage
      title="Semesters"
      description="Semester periods within the active academic session."
      stats={[]}
      rows={[{ id: '1', name: 'First Semester', session: '2025/2026', status: 'active' }, { id: '2', name: 'Second Semester', session: '2025/2026', status: 'pending' }]}
      columns={[{ key: "name", header: "Semester" }, { key: "session", header: "Session", hideOnMobile: true }, { key: "status", header: "Status", render: (r: any) => <StatusBadge status={r.status} /> }]}
      tableTitle="Semesters"
    />
  );
}
