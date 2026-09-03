import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/super-admin/users")({
  head: () => ({
    meta: [
      { title: "Platform Users — D4EXAM" },
      { name: "description", content: "Staff and administrator accounts across all institutions." },
    ],
  }),
  component: Page,
});

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
  school_id?: string | null;
  schools?: { name?: string | null; code?: string | null } | null;
};

function Page() {
  const listQ = useQuery({
    queryKey: ["super-admin-users"],
    staleTime: 20_000,
    queryFn: async () => {
      const selects = [
        "id, full_name, email, status, school_id, schools(name, code)",
        "id, full_name, email, status, school_id",
        "id, full_name, email, status",
      ];
      for (const sel of selects) {
        const { data, error } = await supabase
          .from("profiles")
          .select(sel)
          .order("created_at", { ascending: false })
          .limit(3000);
        if (!error) return (data ?? []) as unknown as UserRow[];
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, status")
        .limit(3000);
      if (error) {
        console.warn("[super-admin-users]", error);
        return [];
      }
      return (data ?? []) as UserRow[];
    },
  });

  const rows = listQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Platform Users"
        description="Staff and administrator accounts across all institutions."
      />
      <SectionCard title={`Users (${rows.length})`}>
        {listQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading users…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No users yet"
            description="User accounts will appear here as schools and staff are onboarded."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">School</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const school =
                    (r.schools as { name?: string; code?: string } | null)?.name ||
                    (r.schools as { name?: string; code?: string } | null)?.code ||
                    "—";
                  return (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-3 text-slate-500">{i + 1}</td>
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">
                        {(r.full_name || "").trim() || "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{(r.email || "").trim() || "—"}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{school}</td>
                      <td className="py-2.5">
                        <StatusBadge status={String(r.status || "active")} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
