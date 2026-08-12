import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/faculties")({
  head: () => ({ meta: [{ title: "Faculty / College — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Faculty / College"
      description="Create and manage faculties and colleges in your institution."
      table="faculties"
      fields={[
        {
          key: "name",
          label: "Faculty / College name",
          required: true,
          placeholder: "e.g. Faculty of Science",
        },
        { key: "code", label: "Code", placeholder: "e.g. SCI" },
      ]}
      columns={[
        { key: "name", header: "Faculty / College" },
        { key: "code", header: "Code", render: (r) => r.code || "—" },
      ]}
    />
  ),
});
