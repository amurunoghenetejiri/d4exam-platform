import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, ShieldCheck, UserPlus, Trash2, Building2 } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSchoolUser } from "@/lib/auth.school-admin.functions";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/officers")({
  head: () => ({
    meta: [{ title: "Departmental Officers — D4EXAM" }],
  }),
  component: Page,
});

type Officer = {
  id: string;
  officer_id: string;
  status: string;
  department_id?: string | null;
  profile_id?: string | null;
  profiles: { full_name: string; email?: string } | null;
  departments?: { name?: string } | null;
};

type Dept = { id: string; name: string };

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const schoolCode = user?.schoolCode ?? "";
  const createOne = useServerFn(createSchoolUser);
  const qc = useQueryClient();

  const listQ = useRows<Officer>({
    table: "examination_officers",
    select: "id, officer_id, status, department_id, profile_id, profiles(full_name, email), departments(name)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 200,
    enabled: Boolean(schoolId),
  });

  const deptsQ = useRows<Dept>({
    table: "departments",
    select: "id, name",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "name", ascending: true },
    limit: 300,
    enabled: Boolean(schoolId),
  });

  const officers = listQ.data ?? [];
  const departments = deptsQ.data ?? [];
  const deptName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [lastCreds, setLastCreds] = useState<{
    officerId: string;
    email: string;
    password: string;
  } | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) {
      toast.error("Your account is not linked to a school.");
      return;
    }
    setBusy(true);
    try {
      const result = await createOne({
        data: {
          role: "examination_officer",
          firstName: firstName.trim(),
          lastName: lastName.trim() || "Officer",
          email: email.trim().toLowerCase(),
          identifier: officerId.trim(),
          departmentId: departmentId || null,
        },
      });
      // Best-effort map department if column exists
      if (departmentId && result?.id) {
        try {
          await supabase
            .from("examination_officers")
            .update({ department_id: departmentId } as never)
            .eq("id", String(result.id));
        } catch {
          /* column may not exist yet */
        }
      }
      setLastCreds({
        officerId: result.identifier,
        email: result.email,
        password: result.password ?? officerId.trim(),
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setOfficerId("");
      setDepartmentId("");
      toast.success("Departmental officer created");
      await qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create officer");
    } finally {
      setBusy(false);
    }
  }

  async function mapDepartment(officerRowId: string, deptId: string) {
    setActionBusy(officerRowId);
    try {
      const { error } = await supabase
        .from("examination_officers")
        .update({ department_id: deptId || null, updated_at: new Date().toISOString() } as never)
        .eq("id", officerRowId);
      if (error) throw error;
      toast.success(deptId ? "Department assigned" : "Department cleared");
      await listQ.refetch?.();
      await qc.invalidateQueries();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not map department. Run the SQL migration to add department_id on examination_officers.",
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function removeOfficer(o: Officer) {
    if (!confirm(`Remove departmental officer ${o.profiles?.full_name || o.officer_id}? They will no longer access the app.`)) {
      return;
    }
    setActionBusy(o.id);
    try {
      const { error } = await supabase
        .from("examination_officers")
        .update({ status: "suspended", updated_at: new Date().toISOString() } as never)
        .eq("id", o.id);
      if (error) throw error;
      if (o.profile_id) {
        await supabase
          .from("profiles")
          .update({ status: "suspended", updated_at: new Date().toISOString() } as never)
          .eq("id", o.profile_id);
      }
      toast.success("Officer removed (suspended)");
      await qc.invalidateQueries();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove officer");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Departmental Officers"
        description="Create officers, map each one to a department, and remove access when needed."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add departmental officer">
          <form className="space-y-3" onSubmit={onCreate}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Officer ID (also their password)</Label>
              <Input value={officerId} onChange={(e) => setOfficerId(e.target.value)} required minLength={4} />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                <option value="">Select department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">Maps this officer to one department (e.g. Computer Engineering).</p>
            </div>
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Create departmental officer
            </Button>
            <p className="text-xs text-slate-500">
              Login: school code <strong>{schoolCode || "—"}</strong> + email/officer ID · password = Officer ID.
            </p>
          </form>
          {lastCreds ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-bold">Give these login details to the departmental officer</p>
              <p className="mt-1">Officer ID: {lastCreds.officerId}</p>
              <p>Email: {lastCreds.email}</p>
              <p>Password: {lastCreds.password}</p>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="How departmental officers work">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>School Admin creates the officer and maps them to a department.</li>
            <li>That officer only works for exams/students in their department where enforced.</li>
            <li>Remove (suspend) an officer to revoke app access immediately.</li>
          </ol>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Existing officers">
          {listQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : officers.length === 0 ? (
            <EmptyState
              title="No departmental officers yet"
              description="Create the first departmental officer with the form above."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {officers.map((o) => {
                const mappedName =
                  o.departments?.name ||
                  (o.department_id ? deptName.get(o.department_id) : null) ||
                  "No department";
                return (
                  <li key={o.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">
                        {o.profiles?.full_name ?? "Officer"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {o.officer_id}
                        {o.profiles?.email ? ` · ${o.profiles.email}` : ""}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <Building2 className="h-3.5 w-3.5" />
                        {mappedName}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={o.status || "active"} />
                      <select
                        className="h-9 max-w-[12rem] rounded-md border border-slate-200 bg-white px-2 text-xs"
                        value={o.department_id ?? ""}
                        disabled={actionBusy === o.id}
                        onChange={(e) => void mapDepartment(o.id, e.target.value)}
                      >
                        <option value="">No department</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-red-200 text-red-600 hover:bg-red-50"
                        disabled={actionBusy === o.id || o.status === "suspended"}
                        onClick={() => void removeOfficer(o)}
                      >
                        {actionBusy === o.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span className="ml-1">Remove</span>
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
