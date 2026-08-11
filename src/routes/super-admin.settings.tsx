import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/pages/SettingsPage";

export const Route = createFileRoute("/super-admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — D4EXAM" },
      { name: "description", content: "Manage preferences, notifications and security for your super admin account." },
      { property: "og:title", content: "Settings — D4EXAM" },
      { property: "og:description", content: "Manage preferences, notifications and security for your super admin account." },
    ],
  }),
  component: () => <SettingsPage scope="super admin" />,
});
