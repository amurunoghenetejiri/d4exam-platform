import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/pages/ProfilePage";
import { currentStudent } from "@/data/mock";

export const Route = createFileRoute("/student/profile")({
  head: () => ({
    meta: [
      { title: "Profile — D4EXAM" },
      { name: "description", content: "Personal and institutional details for your student account." },
      { property: "og:title", content: "Profile — D4EXAM" },
      { property: "og:description", content: "Personal and institutional details for your student account." },
    ],
  }),
  component: () => <ProfilePage profile={{ name: currentStudent.name, avatar: currentStudent.avatar, role: currentStudent.department + " · " + currentStudent.level, school: currentStudent.school, identifier: { label: "Matric number", value: currentStudent.matric }, email: currentStudent.email, extra: [{ label: "Faculty", value: currentStudent.faculty }, { label: "Session", value: currentStudent.session }] }} />,
});
