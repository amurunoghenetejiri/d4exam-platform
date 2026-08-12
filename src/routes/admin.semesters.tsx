import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/semesters")({
  head: () => ({ meta: [{ title: "Semesters — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Semesters"
      description="Semesters or terms for your school."
      table="semesters"
      select="id, name, status, created_at"
      fields={[{ key: "name", label: "Semester name", required: true, placeholder: "e.g. First Semester" }]}
      columns={[{ key: "name", header: "Semester" }]}
    />
  ),
});
