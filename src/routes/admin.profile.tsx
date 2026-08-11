import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/pages/ProfilePage";
import { currentAdmin } from "@/data/mock";

export const Route = createFileRoute("/admin/profile")({
  head: () => ({
    meta: [
      { title: "Profile — D4EXAM" },
      { name: "description", content: "Personal and institutional details for your school admin account." },
      { property: "og:title", content: "Profile — D4EXAM" },
      { property: "og:description", content: "Personal and institutional details for your school admin account." },
    ],
  }),
  component: () => <ProfilePage profile={{ name: currentAdmin.name, avatar: currentAdmin.avatar, role: currentAdmin.role, school: currentAdmin.school, identifier: { label: "Staff ID", value: currentAdmin.staffId }, email: "grace.okonkwo@examplestate.edu.ng" }} />,
});
