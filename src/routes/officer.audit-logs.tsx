import { createFileRoute } from "@tanstack/react-router";
import { RecordsPage } from "@/components/pages/RecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";
import * as mock from "@/data/mock";

export const Route = createFileRoute("/officer/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — D4EXAM" },
      { name: "description", content: "Recorded administrative and examination actions." },
      { property: "og:title", content: "Audit Logs — D4EXAM" },
      { property: "og:description", content: "Recorded administrative and examination actions." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RecordsPage
      title="Audit Logs"
      description="Recorded administrative and examination actions."
      stats={[]}
      rows={mock.auditLogs}
      columns={[{ key: "actor", header: "Actor" }, { key: "action", header: "Action" }, { key: "target", header: "Target", hideOnMobile: true }, { key: "time", header: "Time", hideOnMobile: true }, { key: "ip", header: "IP", hideOnMobile: true }]}
      tableTitle="Audit Logs"
    />
  );
}
