import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Ban, CheckCircle2, Eye } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  full_name: string | null;
  status: string;
  faculty_id: string | null;
  department_id: string | null;
  level_id: string | null;
  profiles: { full_name: string; email?: string } | null;
  faculties: { name: string; code: string | null } | null;
  departments: { name: string; code: string | null } | null;
  levels: { name: string; code: string | null } | null;
};

function displayName(s: StudentRow) {
  return (s.full_name || s.profiles?.full_name || "").trim() || "—";
}

type SortKey = "name" | "matric" | "level";

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const schoolCode = user?.schoolCode ?? "";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [facultyFilter, setFacultyFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");

  const listQ = useQuery({
    queryKey: ["admin-all-students", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          `id, student_id, matric_number, full_name, status,
           faculty_id, department_id, level_id,
           profiles(full_name, email),
           faculties(name, code),
           departments(name, code),
           levels(name, code)`,
        )
        .eq("school_id", schoolId!)
        .limit(5000);

      if (error) {
        const { data: d2, error: e2 } = await supabase
          .from("students")
          .select(
            `id, student_id, matric_number, status,
             faculty_id, department_id, level_id,
             profiles(full_name, email),
             faculties(name, code),
             departments(name, code),
             levels(name, code)`,
          )
          .eq("school_id", schoolId!)
          .limit(5000);
        if (e2) throw e2;
        return ((d2 ?? []) as StudentRow[]).map((s) => ({ ...s, full_name: null }));
      }
      return (data ?? []) as StudentRow[];
    },
  });

  const facultiesQ = useQuery({
    queryKey: ["admin-filter-faculties", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const { data } = await supabase
        .from("faculties")
        .select("id, name")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const deptsQ = useQuery({
    queryKey: ["admin-filter-depts", schoolId, facultyFilter],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      let q = supabase
        .from("departments")
        .select("id, name, faculty_id")
        .eq("school_id", schoolId!)
        .order("name");
      if (facultyFilter !== "all") q = q.eq("faculty_id", facultyFilter);
      const { data } = await q;
      return (data ?? []) as { id: string; name: string; faculty_id: string | null }[];
    },
  });

  const levelsQ = useQuery({
    queryKey: ["admin-filter-levels", schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      const { data } = await supabase
        .from("levels")
        .select("id, name")
        .eq("school_id", schoolId!)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const rows = useMemo(() => {
    const all = listQ.data ?? [];
    const q = search.trim().toLowerCase();
    const filtered = all.filter((s) => {
      if (facultyFilter !== "all" && s.faculty_id !== facultyFilter) return false;
      if (deptFilter !== "all" && s.department_id !== deptFilter) return false;
      if (levelFilter !== "all" && s.level_id !== levelFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        displayName(s),
        s.matric_number ?? "",
        s.student_id,
        s.faculties?.name ?? "",
        s.departments?.name ?? "",
        s.levels?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    // Default: alphabetical by full name A → Z
    filtered.sort((a, b) => {
      if (sortBy === "matric") {
        const ma = (a.matric_number || a.student_id || "").toLowerCase();
        const mb = (b.matric_number || b.student_id || "").toLowerCase();
        return ma.localeCompare(mb, undefined, { sensitivity: "base" });
      }
      if (sortBy === "level") {
        const la = (a.levels?.name || "").toLowerCase();
        const lb = (b.levels?.name || "").toLowerCase();
        if (la !== lb) return la.localeCompare(lb, undefined, { sensitivity: "base" });
      }
      return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" });
    });

    return filtered;
  }, [listQ.data, search, facultyFilter, deptFilter, levelFilter, statusFilter, sortBy]);

  async function toggleStatus(s: StudentRow) {
    if (!schoolId) return;
    const next = s.status === "suspended" ? "active" : "suspended";
    try {
      const { error } = await supabase
        .from("students")
        .update({ status: next } as never)
        .eq("id", s.id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success(next === "active" ? "Student unsuspended" : "Student suspended");
      await listQ.refetch();
      await qc.invalidateQueries({ queryKey: ["struct-students"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Students"
        description="All students in your school, sorted A–Z by name. Import updates existing matric numbers without wiping exam history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="font-semibold" asChild>
              <Link to="/admin/student-import">Import students</Link>
            </Button>
            <Button variant="outline" className="font-semibold" asChild>
              <Link to="/admin/structure">Academic Structure</Link>
            </Button>
          </div>
        }
      />

      <SectionCard title="Login reminder">
        <p className="text-sm text-slate-700">
          School code: <strong>{schoolCode || "—"}</strong> · Username: email or matric · Password:{" "}
          <strong>their matric / student ID</strong>
        </p>
      </SectionCard>

      <SectionCard className="mt-6" title={`Students (${rows.length})`}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search name or matric…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={facultyFilter}
            onValueChange={(v) => {
              setFacultyFilter(v);
              setDeptFilter("all");
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="College" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All colleges</SelectItem>
              {(facultiesQ.data ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {(deptsQ.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              {(levelsQ.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name (A–Z)</SelectItem>
              <SelectItem value="matric">Matric number</SelectItem>
              <SelectItem value="level">Level</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {listQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading students…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No students found"
            description="Import a CSV or add students under Academic Structure → Department → Level."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">SN</th>
                  <th className="py-2 pr-3">Full name</th>
                  <th className="py-2 pr-3">Matric</th>
                  <th className="py-2 pr-3">College</th>
                  <th className="py-2 pr-3">Department</th>
                  <th className="py-2 pr-3">Level</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const suspended = s.status === "suspended";
                  return (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="py-2.5 pr-3 text-slate-500">{i + 1}</td>
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">{displayName(s)}</td>
                      <td className="py-2.5 pr-3">{s.matric_number ?? s.student_id}</td>
                      <td className="py-2.5 pr-3">{s.faculties?.name ?? "—"}</td>
                      <td className="py-2.5 pr-3">{s.departments?.name ?? "—"}</td>
                      <td className="py-2.5 pr-3">{s.levels?.name ?? "—"}</td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs font-semibold" asChild>
                            <a href={`/admin/student/${s.id}`}>
                              <Eye className="h-3.5 w-3.5 text-primary" />
                              View
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-xs font-semibold"
                            onClick={() => void toggleStatus(s)}
                          >
                            {suspended ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                Unsuspend
                              </>
                            ) : (
                              <>
                                <Ban className="h-3.5 w-3.5" />
                                Suspend
                              </>
                            )}
                          </Button>
                        </div>
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
