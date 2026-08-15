import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/semesters")({
  head: () => ({ meta: [{ title: "Semesters — D4EXAM" }] }),
  component: Page,
});

type SessionRow = { id: string; name: string; status: string };
type SemesterRow = {
  id: string;
  name: string;
  status: string;
  academic_session_id: string | null;
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
  const [sessionId, setSessionId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const sessionsQ = useQuery({
    queryKey: ["admin-sessions", schoolId],
    enabled: Boolean(schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_sessions")
        .select("id, name, status")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
  });

  const listQ = useQuery({
    queryKey: ["admin-semesters", schoolId],
    enabled: Boolean(schoolId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semesters")
        .select("id, name, status, academic_session_id, start_date, end_date, created_at")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SemesterRow[];
    },
  });

  const sessions = sessionsQ.data ?? [];
  const rows = listQ.data ?? [];

  const sessionName = useMemo(() => {
    const m = new Map(sessions.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown session" : "No session linked");
  }, [sessions]);

  const activeSession = sessions.find((s) => String(s.status).toLowerCase() === "active");
  const activeSem = useMemo(
    () => rows.find((r) => String(r.status).toLowerCase() === "active") ?? null,
    [rows],
  );

  // Default the form to the active session when available
  const formSessionId = sessionId || activeSession?.id || sessions[0]?.id || "";

  async function createSemester(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) return;
    const n = name.trim();
    if (!n) {
      toast.error("Semester name is required");
      return;
    }
    if (!formSessionId) {
      toast.error("Create an academic session first, then link this semester to it");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("semesters").insert({
        school_id: schoolId,
        name: n,
        academic_session_id: formSessionId,
        start_date: startDate || null,
        end_date: endDate || null,
        status: rows.length === 0 ? "active" : "inactive",
      } as never);
      if (error) throw error;
      toast.success("Semester created");
      setName("");
      setStartDate("");
      setEndDate("");
      await listQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-context"] });
      await qc.invalidateQueries({ queryKey: ["admin-session-sem-counts"] });
    } catch (err) {
      toast.error((err as Error).message || "Could not create semester");
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string) {
    if (!schoolId) return;
    setBusy(true);
    try {
      await supabase
        .from("semesters")
        .update({ status: "inactive", updated_at: new Date().toISOString() } as never)
        .eq("school_id", schoolId)
        .neq("id", id);

      const { error } = await supabase
        .from("semesters")
        .update({ status: "active", updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Active semester updated");
      await listQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-context"] });
    } catch (err) {
      toast.error((err as Error).message || "Could not set active semester");
    } finally {
      setBusy(false);
    }
  }

  async function setInactive(id: string) {
    if (!schoolId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("semesters")
        .update({ status: "inactive", updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("school_id", schoolId);
      if (error) throw error;
      toast.success("Semester deactivated");
      await listQ.refetch();
      await qc.invalidateQueries({ queryKey: ["student-context"] });
    } catch (err) {
      toast.error((err as Error).message || "Could not update semester");
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
        title="Semesters / terms"
        description="Link each semester to an academic session. Mark one as Active so students see the right courses for this term."
        actions={
          <Button variant="outline" className="font-semibold" asChild>
            <Link to="/admin/sessions">Manage sessions</Link>
          </Button>
        }
      />

      {(activeSession || activeSem) && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Currently active for students
          </p>
          <p className="mt-1 text-emerald-800">
            Session: <strong>{activeSession?.name ?? "— none set —"}</strong>
            {" · "}
            Semester: <strong>{activeSem?.name ?? "— none set —"}</strong>
          </p>
        </div>
      )}

      {sessions.length === 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Create an academic session first (e.g. 2025/2026), then add semesters under it.{" "}
          <Link to="/admin/sessions" className="font-semibold underline">
            Go to Sessions
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add semester" description="Attach to a session year">
          <form className="space-y-3" onSubmit={(e) => void createSemester(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="sem-name">Semester name</Label>
              <Input
                id="sem-name"
                placeholder="e.g. First Semester / Harmattan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sem-session">Academic session</Label>
              <select
                id="sem-session"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={formSessionId}
                onChange={(e) => setSessionId(e.target.value)}
                required
              >
                <option value="">Select session…</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {String(s.status).toLowerCase() === "active" ? " (active)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sem-start">Start date (optional)</Label>
                <Input
                  id="sem-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sem-end">End date (optional)</Label>
                <Input
                  id="sem-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={busy || !schoolId || sessions.length === 0}
              className="font-semibold"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Save semester
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title={`All semesters (${rows.length})`}
          description="Set one as Active for the current term"
        >
          {listQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No semesters yet"
              description="Add First Semester / Second Semester under your active session."
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => {
                const isActive = String(row.status).toLowerCase() === "active";
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
                        <p className="mt-0.5 text-xs text-slate-500">
                          {sessionName(row.academic_session_id)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDate(row.start_date)} → {formatDate(row.end_date)}
                        </p>
                      </div>
                      <StatusBadge status={isActive ? "active" : row.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!isActive ? (
                        <Button
                          size="sm"
                          className="h-8 font-semibold"
                          disabled={busy}
                          onClick={() => void setActive(row.id)}
                        >
                          Set as active
                        </Button>
                      ) : (
                        <span className="inline-flex h-8 items-center rounded-md bg-emerald-100 px-2.5 text-xs font-semibold text-emerald-800">
                          Current term
                        </span>
                      )}
                      {isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={busy}
                          onClick={() => void setInactive(row.id)}
                        >
                          Deactivate
                        </Button>
                      )}
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
