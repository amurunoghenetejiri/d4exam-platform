import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/departments")({
  head: () => ({ meta: [{ title: "Departments — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Departments"
      description="Create departments under your school."
      table="departments"
      fields={[
        { key: "name", label: "Department name", required: true, placeholder: "e.g. Computer Science" },
        { key: "code", label: "Code", placeholder: "e.g. CSC" },
      ]}
      columns={[
        { key: "name", header: "Name" },
        { key: "code", header: "Code", render: (r) => r.code || "—" },
      ]}
    />
  ),
});
