import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/faculties")({
  head: () => ({ meta: [{ title: "Faculty / Department — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Faculty / Department"
      description="Create and manage faculty and department structures in your institution."
      table="faculties"
      fields={[
        {
          key: "name",
          label: "Faculty / Department name",
          required: true,
          placeholder: "e.g. Faculty of Science",
        },
        { key: "code", label: "Code", placeholder: "e.g. SCI" },
      ]}
      columns={[
        { key: "name", header: "Faculty / Department" },
        { key: "code", header: "Code", render: (r) => r.code || "—" },
      ]}
    />
  ),
});
