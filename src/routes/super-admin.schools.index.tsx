import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight, Search, GraduationCap } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SchoolLogo } from "@/components/brand/SchoolLogo";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/super-admin/schools/")({
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
  logo_url: string | null;
  subscription_plan: string | null;
  status: string;
  created_at: string | null;
};

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
  { id: "blocked", label: "Blocked" },
  { id: "revoked", label: "Revoked" },
] as const;

function Page() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const schoolsQ = useQuery({
    queryKey: ["sa-schools-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, school_code, country, logo_url, subscription_plan, status, created_at")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SchoolRow[];
    },
  });

  const countsQ = useQuery({
    queryKey: ["sa-schools-counts"],
    queryFn: async () => {
      const [departments, students] = await Promise.all([
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
        departments: tally(departments.data as { school_id: string | null }[] | null),
        students: tally(students.data as { school_id: string | null }[] | null),
      };
    },
  });

  const schools = useMemo(() => {
    const list = schoolsQ.data ?? [];
    const term = q.trim().toLowerCase();
    return list.filter((s) => {
      if (statusFilter !== "all" && (s.status || "").toLowerCase() !== statusFilter) return false;
      if (!term) return true;
      return [s.name, s.school_code ?? "", s.country ?? ""].join(" ").toLowerCase().includes(term);
    });
  }, [schoolsQ.data, q, statusFilter]);

  const counts = countsQ.data;

  return (
    <>
      <PageHeader
        title="Schools"
        description="All institutions on D4EXAM. Open a school for full overview."
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition",
              statusFilter === f.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search by name, School ID, location…"
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
          <ul className="space-y-2">
            {schools.map((s) => {
              const dept = counts?.departments[s.id] ?? 0;
              const stu = counts?.students[s.id] ?? 0;
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition hover:border-primary/30"
                >
                  <div className="flex items-center gap-3">
                    <SchoolLogo
                      logoUrl={s.logo_url}
                      schoolName={s.name}
                      size="md"
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-extrabold text-slate-900">{s.name}</p>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {s.school_code ? `ID ${s.school_code}` : "No code"}
                        {s.country ? ` · ${s.country}` : ""}
                        {s.subscription_plan ? ` · ${s.subscription_plan}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        {dept} departments · {stu} students
                      </p>
                    </div>
                    <Button size="sm" className="shrink-0 font-semibold" asChild>
                      <Link to="/super-admin/schools/$id" params={{ id: s.id }}>
                        Open <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
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
