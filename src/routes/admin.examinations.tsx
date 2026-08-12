import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/examinations")({
  head: () => ({ meta: [{ title: "Examinations — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Examinations"
      description="Create examination records for your school. Teachers can attach questions later."
      table="examinations"
      select="id, title, status, duration_minutes, scheduled_start, created_at"
      fields={[
        { key: "title", label: "Exam title", required: true, placeholder: "e.g. CSC101 Mid-Semester Test" },
        { key: "duration_minutes", label: "Duration (minutes)", type: "number", required: true, placeholder: "60" },
      ]}
      extraDefaults={{ status: "draft" }}
      columns={[
        { key: "title", header: "Title" },
        {
          key: "duration_minutes",
          header: "Duration",
          render: (r) => `${r.duration_minutes ?? 0} min`,
        },
      ]}
    />
  ),
});
