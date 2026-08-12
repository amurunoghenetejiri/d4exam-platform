import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/admin/students")({
  head: () => ({
    meta: [{ title: "Students — D4EXAM" }],
  }),
  component: Page,
});

type StudentRow = {
  id: string;
  student_id: string;
  matric_number: string | null;
  status: string;
  profiles: { full_name: string; email?: string } | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;

  const list = useRows<StudentRow>({
    table: "students",
    select: "id, student_id, matric_number, status, profiles(full_name, email)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 300,
    enabled: Boolean(schoolId),
  });

  return (
    <>
      <PageHeader
        title="Students"
        description="All students in your school. Import new ones from Student Import."
        actions={
          <Button className="gap-2 font-semibold" asChild>
            <Link to="/admin/student-import">
              <Upload className="h-4 w-4" />
              Import students
            </Link>
          </Button>
        }
      />

      <SectionCard title="Student list" description={`${(list.data ?? []).length} records`}>
        {(list.data ?? []).length === 0 ? (
          <EmptyState
            title="No students yet"
            description="Go to Student Import to upload a CSV from Excel, or add students there."
            actionLabel="Open Student Import"
            onAction={() => {
              window.location.href = "/admin/student-import";
            }}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(list.data ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{s.profiles?.full_name ?? "—"}</p>
                  <p className="text-xs text-slate-500">
                    Matric: {s.matric_number ?? s.student_id}
                    {s.profiles?.email ? ` · ${s.profiles.email}` : ""}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
