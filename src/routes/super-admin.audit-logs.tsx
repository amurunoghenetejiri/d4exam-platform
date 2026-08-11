import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/super-admin/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — D4EXAM" },
      { name: "description", content: "Platform-level administrative activity." },
      { property: "og:title", content: "Audit Logs — D4EXAM" },
      { property: "og:description", content: "Platform-level administrative activity." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Audit Logs"
      description="Platform-level administrative activity."
      stats={[]}
      rows={mock.auditLogs}
      columns={[{ key: "actor", header: "Actor" }, { key: "action", header: "Action" }, { key: "target", header: "Target", hideOnMobile: true }, { key: "time", header: "Time", hideOnMobile: true }, { key: "ip", header: "IP", hideOnMobile: true }]}
      tableTitle="Audit Logs"
    />
  );
}
