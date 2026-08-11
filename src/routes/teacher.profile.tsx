import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/pages/ProfilePage";
import { currentTeacher } from "@/data/mock";

export const Route = createFileRoute("/teacher/profile")({
  head: () => ({
    meta: [
      { title: "Profile — D4EXAM" },
      { name: "description", content: "Personal and institutional details for your teacher account." },
      { property: "og:title", content: "Profile — D4EXAM" },
      { property: "og:description", content: "Personal and institutional details for your teacher account." },
    ],
  }),
  component: () => <ProfilePage profile={{ name: currentTeacher.name, avatar: currentTeacher.avatar, role: "Lecturer · " + currentTeacher.department, school: currentTeacher.school, identifier: { label: "Staff ID", value: currentTeacher.staffId }, email: "john.doe@examplestate.edu.ng" }} />,
});
