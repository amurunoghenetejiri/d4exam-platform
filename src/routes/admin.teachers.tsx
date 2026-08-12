import { createFileRoute } from "@tanstack/react-router";
import { DbRecordsPage, type Row } from "@/components/pages/DbRecordsPage";
import { StatusBadge } from "@/components/dashboard/kit";

export const Route = createFileRoute("/admin/teachers")({
  head: () => ({
    meta: [
      { title: "Teachers — D4EXAM" },
      { name: "description", content: "Teaching staff accounts and assigned courses." },
      { property: "og:title", content: "Teachers — D4EXAM" },
      { property: "og:description", content: "Teaching staff accounts and assigned courses." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <DbRecordsPage
      title="Teachers"
      description="Teaching staff accounts and assigned courses."
      table="teachers"
      select="id, staff_id, employment_status, profiles(full_name), departments(name)"
      order={{ column: "created_at", ascending: false }}
      tableTitle="Teachers"
      columns={[
      { key: "teacher", header: "Teacher", render: (r: Row) => r.profiles?.full_name ?? "—" },
      { key: "staff_id", header: "Staff ID" },
      { key: "department", header: "Department", hideOnMobile: true, render: (r: Row) => r.departments?.name ?? "—" },
      { key: "employment_status", header: "Status", render: (r: Row) => <StatusBadge status={r.employment_status} /> },
      ]}
    />
  );
}
