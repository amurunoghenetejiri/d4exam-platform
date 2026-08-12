import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/faculties")({
  head: () => ({ meta: [{ title: "Faculties — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Faculties"
      description="Create and manage faculties in your institution."
      table="faculties"
      fields={[
        { key: "name", label: "Faculty name", required: true, placeholder: "e.g. Faculty of Science" },
        { key: "code", label: "Code", placeholder: "e.g. SCI" },
      ]}
      columns={[
        { key: "name", header: "Name" },
        { key: "code", header: "Code", render: (r) => r.code || "—" },
      ]}
    />
  ),
});
