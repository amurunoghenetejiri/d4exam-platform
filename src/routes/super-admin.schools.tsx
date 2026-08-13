import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Search, Users, Blocks, GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/super-admin/schools")({
  head: () => ({
    meta: [
      { title: "Schools — D4EXAM" },
      { name: "description", content: "Institutions onboarded onto the D4EXAM platform." },
    ],
  }),
  component: Page,
});

type SchoolRow = {
  id: string;
  name: string;
  school_code: string | null;
  country: string | null;
  subscription_plan: string | null;
  status: string;
  created_at: string | null;
};

function Page() {
  const [q, setQ] = useState("");

  const schoolsQ = useQuery({
    queryKey: ["sa-schools-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, school_code, country, subscription_plan, status, created_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SchoolRow[];
    },
  });

  const countsQ = useQuery({
    queryKey: ["sa-schools-counts"],
    queryFn: async () => {
      const [users, faculties, departments, students] = await Promise.all([
        supabase.from("profiles").select("school_id"),
        supabase.from("faculties").select("school_id"),
        supabase.from("departments").select("school_id"),
        supabase.from("students").select("school_id"),
      ]);

      const tally = (rows: { school_id: string | null }[] | null) => {
        const m: Record<string, number> = {};
        for (const r of rows ?? []) {
          if (!r.school_id) continue;
          m[r.school_id] = (m[r.school_id] ?? 0) + 1;
        }
        return m;
      };

      return {
        users: tally(users.data as { school_id: string | null }[] | null),
        faculties: tally(faculties.data as { school_id: string | null }[] | null),
        departments: tally(departments.data as { school_id: string | null }[] | null),
        students: tally(students.data as { school_id: string | null }[] | null),
      };
    },
  });

  const schools = useMemo(() => {
    const list = schoolsQ.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((s) =>
      [s.name, s.school_code ?? "", s.country ?? ""].join(" ").toLowerCase().includes(term),
    );
  }, [schoolsQ.data, q]);

  const counts = countsQ.data;

  return (
    <>
      <PageHeader
        title="Schools"
        description="All institutions on D4EXAM. Open a school for full overview."
      />

      <div className="mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search schools…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <SectionCard title={`Schools (${schools.length})`}>
        {schoolsQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading schools…</p>
        ) : schools.length === 0 ? (
          <EmptyState
            title="No schools yet"
            description="Approved applications create school records."
            icon={Building2}
          />
        ) : (
          <ul className="space-y-3">
            {schools.map((s) => {
              const users = counts?.users[s.id] ?? 0;
              const fac = counts?.faculties[s.id] ?? 0;
              const dept = counts?.departments[s.id] ?? 0;
              const stu = counts?.students[s.id] ?? 0;
              const overviewHref = `/super-admin/schools/${s.id}`;
              return (
                <li
                  key={s.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-extrabold text-slate-900">{s.name}</p>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {s.school_code ? `Code ${s.school_code}` : "No code"}
                        {s.country ? ` · ${s.country}` : ""}
                        {s.subscription_plan ? ` · ${s.subscription_plan}` : ""}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1">
                          <Users className="h-3.5 w-3.5 text-primary" /> {users} users
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1">
                          <Building2 className="h-3.5 w-3.5 text-primary" /> {fac} faculties
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1">
                          <Blocks className="h-3.5 w-3.5 text-primary" /> {dept} departments
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1">
                          <GraduationCap className="h-3.5 w-3.5 text-primary" /> {stu} students
                        </span>
                      </div>
                    </div>
                    <Button size="sm" className="font-semibold" asChild>
                      <a href={overviewHref}>
                        Open overview <ChevronRight className="ml-1 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
