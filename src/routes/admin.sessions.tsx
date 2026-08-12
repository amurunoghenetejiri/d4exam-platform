import { createFileRoute } from "@tanstack/react-router";
import { SchoolEntityPage } from "@/components/pages/SchoolEntityPage";

export const Route = createFileRoute("/admin/sessions")({
  head: () => ({ meta: [{ title: "Sessions — D4EXAM" }] }),
  component: () => (
    <SchoolEntityPage
      title="Sessions"
      description="Academic sessions (e.g. 2025/2026)."
      table="academic_sessions"
      select="id, name, status, created_at"
      fields={[{ key: "name", label: "Session name", required: true, placeholder: "e.g. 2025/2026" }]}
      columns={[{ key: "name", header: "Session" }]}
    />
  ),
});
