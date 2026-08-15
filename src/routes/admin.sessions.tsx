import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, CheckCircle2, Loader2, Plus } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/sessions")({
  head: () => ({ meta: [{ title: "Academic Sessions — D4EXAM" }] }),
  component: Page,
});

type SessionRow = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-sessions", schoolId],
    enabled: Boolean(schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_sessions")
        .select("id, name, status, start_date, end_date, created_at")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const semCountQ = useQuery({
    queryKey: ["admin-session-sem-counts", schoolId],
    enabled: Boolean(schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semesters")
        .select("id, academic_session_id")
        .eq("school_id", schoolId!);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const s of data ?? []) {
        const sid = (s as { academic_session_id?: string | null }).academic_session_id;
        if (!sid) continue;
        map.set(sid, (map.get(sid) ?? 0) + 1);
      }
      return map;
    },
  });

  const rows = listQ.data ?? [];
  const active = useMemo(
    () => rows.find((r) => String(r.status).toLowerCase() === "active") ?? null,
    [rows],
  );

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    const n = name.trim();
    if (!n) {
      toast.error("Session name is required");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("academic_sessions").insert({
        school_id: schoolId,
        name: n,
        start_date: startDate || null,
        end_date: endDate || null,
        status: rows.length === 0 ? "active" : "inactive",
      } as never);
      if (error) throw error;
      toast.success("Session created");
      setName("");
      setStartDate("");
      setEndDate("");
      await listQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-context"] });
    } catch (err) {
      toast.error((err as Error).message || "Could not create session");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string) {
    if (!schoolId) return;
    setBusy(true);
    try {
      // Only one active session per school
      await supabase
        .from("academic_sessions")
        .update({ status: "inactive", updated_at: new Date().toISOString() } as never)
        .eq("school_id", schoolId)
        .neq("id", id);

      const { error } = await supabase
        .from("academic_sessions")
        .update({ status: "active", updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Active session updated");
      await listQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-context"] });
      await qc.invalidateQueries({ queryKey: ["admin-sessions"] });
    } catch (err) {
      toast.error((err as Error).message || "Could not set active session");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: "active" | "inactive" | "closed") {
    if (!schoolId) return;
    if (status === "active") {
      await setActive(id);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("academic_sessions")
        .update({ status, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Session updated");
      await listQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-context"] });
    } catch (err) {
      toast.error((err as Error).message || "Could not update session");
    } finally {
      setBusy(false);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  }

  return (
    <>
      <PageHeader
        title="Academic sessions"
        description="Define school years (e.g. 2025/2026). Mark one as Active — students and course eligibility follow the active session and its active semester."
        actions={
          <Button variant="outline" className="font-semibold" asChild>
            <Link to="/admin/semesters">Manage semesters</Link>
          </Button>
        }
      />

      {active && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">Current active session</p>
            <p className="text-emerald-800">{active.name}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add session" description="Create a new academic year">
          <form className="space-y-3" onSubmit={(e) => void createSession(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="session-name">Session name</Label>
              <Input
                id="session-name"
                placeholder="e.g. 2025/2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="start">Start date (optional)</Label>
                <Input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end">End date (optional)</Label>
                <Input
                  id="end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Save session
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title={`All sessions (${rows.length})`}
          description="Only one session should be Active at a time"
        >
          {listQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No sessions yet"
              description="Add your first academic year, e.g. 2025/2026."
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => {
                const isActive = String(row.status).toLowerCase() === "active";
                const semCount = semCountQ.data?.get(row.id) ?? 0;
                return (
                  <li
                    key={row.id}
                    className={cn(
                      "rounded-xl border px-4 py-3",
                      isActive ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{row.name}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <CalendarRange className="h-3.5 w-3.5" />
                          {formatDate(row.start_date)} → {formatDate(row.end_date)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {semCount} semester{semCount === 1 ? "" : "s"} linked
                        </p>
                      </div>
                      <StatusBadge status={isActive ? "active" : row.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!isActive && (
                        <Button
                          size="sm"
                          className="h-8 font-semibold"
                          disabled={busy}
                          onClick={() => void setActive(row.id)}
                        >
                          Set as active
                        </Button>
                      )}
                      {isActive && (
                        <span className="inline-flex h-8 items-center rounded-md bg-emerald-100 px-2.5 text-xs font-semibold text-emerald-800">
                          Current year
                        </span>
                      )}
                      {isActive ? null : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={busy}
                          onClick={() => void setStatus(row.id, "closed")}
                        >
                          Close
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8" asChild>
                        <Link to="/admin/semesters">Add semesters</Link>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
