import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/pages/SettingsPage";

export const Route = createFileRoute("/officer/settings")({
  head: () => ({
    meta: [
      { title: "Settings — D4EXAM" },
      { name: "description", content: "Manage preferences, notifications and security for your examination officer account." },
      { property: "og:title", content: "Settings — D4EXAM" },
      { property: "og:description", content: "Manage preferences, notifications and security for your examination officer account." },
    ],
  }),
  component: () => <SettingsPage scope="examination officer" />,
});
