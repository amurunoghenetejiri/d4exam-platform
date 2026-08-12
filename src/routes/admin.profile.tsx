import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/pages/ProfilePage";

export const Route = createFileRoute("/admin/profile")({
  head: () => ({
    meta: [{ title: "Profile — D4EXAM" }],
  }),
  component: ProfilePage,
});
