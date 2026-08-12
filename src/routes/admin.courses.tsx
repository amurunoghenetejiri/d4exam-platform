import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/courses")({
  head: () => ({ meta: [{ title: "Courses — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Courses"
      description="Courses offered in your institution."
      table="courses"
      select="id, code, name, credit_units, status, created_at"
      fields={[
        { key: "code", label: "Course code", required: true, placeholder: "e.g. CSC101" },
        { key: "name", label: "Course title", required: true, placeholder: "e.g. Introduction to Computing" },
        { key: "credit_units", label: "Credit units", type: "number", placeholder: "3" },
      ]}
      columns={[
        { key: "code", header: "Code" },
        { key: "name", header: "Title", render: (r) => r.name },
        { key: "credit_units", header: "Units", render: (r) => `${r.credit_units ?? 0} units` },
      ]}
    />
  ),
});
