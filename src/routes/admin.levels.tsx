import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/levels")({
  head: () => ({ meta: [{ title: "Levels — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Levels"
      description="Academic levels (100, 200, ND1, SS2, etc.)."
      table="levels"
      fields={[
        { key: "name", label: "Level name", required: true, placeholder: "e.g. 100 Level" },
        { key: "code", label: "Code", placeholder: "e.g. L100" },
      ]}
      columns={[
        { key: "name", header: "Name" },
        { key: "code", header: "Code", render: (r) => r.code || "—" },
      ]}
    />
  ),
});
