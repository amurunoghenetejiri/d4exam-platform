import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/pages/ProfilePage";
import { currentSuperAdmin } from "@/data/mock";

export const Route = createFileRoute("/super-admin/profile")({
  head: () => ({
    meta: [
      { title: "Profile — D4EXAM" },
      { name: "description", content: "Personal and institutional details for your super admin account." },
      { property: "og:title", content: "Profile — D4EXAM" },
      { property: "og:description", content: "Personal and institutional details for your super admin account." },
    ],
  }),
  component: () => <ProfilePage profile={{ name: currentSuperAdmin.name, avatar: currentSuperAdmin.avatar, role: currentSuperAdmin.role, school: currentSuperAdmin.school, identifier: { label: "Operator ID", value: currentSuperAdmin.staffId }, email: "ops@d4exam.com" }} />,
});
