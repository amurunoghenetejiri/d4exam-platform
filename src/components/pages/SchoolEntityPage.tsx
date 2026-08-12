import { useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Field = {
  key: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
};

/**
 * Generic school-scoped create + list for faculties, departments, levels, courses, etc.
 */
export function SchoolEntityPage({
  title,
  description,
  table,
  select = "id, name, code, status, created_at",
  fields,
  extraDefaults = {},
  columns,
}: {
  title: string;
  description: string;
  table: string;
  select?: string;
  fields: Field[];
  extraDefaults?: Record<string, unknown>;
  columns: { key: string; header: string; render?: (row: any) => React.ReactNode }[];
}) {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const list = useRows<any>({
    table,
    select,
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 200,
    enabled: Boolean(schoolId),
  });

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!schoolId) {
      toast.error("Your account is not linked to a school.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        school_id: schoolId,
        status: "active",
        ...extraDefaults,
      };
      for (const f of fields) {
        const v = (form[f.key] ?? "").trim();
        if (f.required && !v) {
          toast.error(`${f.label} is required`);
          setBusy(false);
          return;
        }
        if (v) payload[f.key] = f.type === "number" ? Number(v) : v;
      }
      const { error } = await supabase.from(table as never).insert(payload as never);
      if (error) throw error;
      toast.success(`${title.slice(0, -1) || title} created`);
      setForm({});
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await qc.invalidateQueries({ queryKey: ["count"] });
      await list.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={title} description={description} />
      {!schoolId && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your account is not linked to a school yet.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={`Add ${title.replace(/s$/, "").toLowerCase()}`}>
          <form className="space-y-3" onSubmit={onCreate}>
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  type={f.type || "text"}
                  required={f.required}
                  placeholder={f.placeholder}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              </div>
            ))}
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </form>
        </SectionCard>

        <SectionCard title={`All ${title.toLowerCase()}`}>
          {(list.data ?? []).length === 0 ? (
            <EmptyState title={`No ${title.toLowerCase()} yet`} description="Use the form to add the first one." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(list.data ?? []).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    {columns.map((c) => (
                      <p
                        key={c.key}
                        className={c.key === columns[0].key ? "font-semibold text-slate-900" : "text-xs text-slate-500"}
                      >
                        {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                      </p>
                    ))}
                  </div>
                  {row.status && <StatusBadge status={String(row.status)} />}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
