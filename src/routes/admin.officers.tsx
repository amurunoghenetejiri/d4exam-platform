import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSchoolUser } from "@/lib/auth.functions";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/officers")({
  head: () => ({
    meta: [{ title: "Examination Officers — D4EXAM" }],
  }),
  component: Page,
});

type Officer = {
  id: string;
  officer_id: string;
  status: string;
  profiles: { full_name: string; email?: string } | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const schoolCode = user?.schoolCode ?? "";
  const createOne = useServerFn(createSchoolUser);
  const qc = useQueryClient();

  const listQ = useRows<Officer>({
    table: "examination_officers",
    select: "id, officer_id, status, profiles(full_name, email)",
    filters: schoolId ? [{ column: "school_id", value: schoolId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 200,
    enabled: Boolean(schoolId),
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [busy, setBusy] = useState(false);
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
        },
      });
      setLastCreds({
        officerId: result.identifier,
        email: result.email,
        password: result.password,
      });
      toast.success(
        `Officer created. They log in at /login with school code + Officer ID (password = Officer ID).`,
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      setOfficerId("");
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not create officer");
    } finally {
      setBusy(false);
    }
  }

  const officers = listQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Examination Officers"
        description="Create officers who approve exams, monitor sessions, and release results. They sign in at the same /login page."
      />

      {!schoolId && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your account is not linked to a school yet.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Add examination officer">
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
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="officer@school.edu"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Officer ID (also their password)</Label>
              <Input
                value={officerId}
                onChange={(e) => setOfficerId(e.target.value)}
                required
                minLength={4}
                placeholder="e.g. OFF001"
              />
              <p className="text-xs text-slate-500">
                Minimum 4 characters. Login password = this Officer ID (same rule as teachers’ Staff
                ID).
              </p>
            </div>
            <Button type="submit" disabled={busy || !schoolId} className="font-semibold">
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Create officer
            </Button>
          </form>

          {lastCreds && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="flex items-center gap-2 font-extrabold">
                <ShieldCheck className="h-4 w-4" />
                Give these login details to the officer
              </p>
              <ul className="mt-2 space-y-1 font-mono text-xs sm:text-sm">
                <li>
                  <span className="font-sans font-semibold">School code:</span>{" "}
                  {schoolCode || "(your school code)"}
                </li>
                <li>
                  <span className="font-sans font-semibold">Officer ID or email:</span>{" "}
                  {lastCreds.officerId} / {lastCreds.email}
                </li>
                <li>
                  <span className="font-sans font-semibold">Password:</span> {lastCreds.password}
                </li>
                <li>
                  <span className="font-sans font-semibold">Opens:</span> /officer portal
                </li>
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard title="How officers sign in">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>School Admin creates the officer on this page.</li>
            <li>Share school code, Officer ID (or email), and password (Officer ID).</li>
            <li>
              Officer goes to <strong>/login</strong> (same page as everyone).
            </li>
            <li>
              After login they are taken to <strong>/officer</strong> — Exam Approvals, Live Monitor,
              Integrity, Results Release.
            </li>
          </ol>
          <p className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            There is no separate officer login URL. Role is read from the database after sign-in.
          </p>
        </SectionCard>
      </div>

      <SectionCard className="mt-6" title="Officers in this school">
        {listQ.isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : officers.length === 0 ? (
          <EmptyState
            title="No examination officers yet"
            description="Create the first officer with the form above."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {officers.map((o) => (
              <li
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {o.profiles?.full_name ?? "Officer"}
                  </p>
                  <p className="text-xs text-slate-500">
                    ID: {o.officer_id}
                    {o.profiles?.email ? ` · ${o.profiles.email}` : ""}
                  </p>
                </div>
                <StatusBadge status={o.status || "active"} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
