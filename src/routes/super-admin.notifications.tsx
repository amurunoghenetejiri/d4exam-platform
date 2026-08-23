import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/components/pages/NotificationsPage";

export const Route = createFileRoute("/super-admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — D4EXAM" },
      { name: "description", content: "Alerts and updates for your super admin account on D4EXAM." },
      { property: "og:title", content: "Notifications — D4EXAM" },
      { property: "og:description", content: "Alerts and updates for your super admin account on D4EXAM." },
    ],
  }),
  component: () => <NotificationsPage scope="super-admin" />,
});
