import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRows } from "@/lib/queries";
import { reviewSchoolApplication } from "@/lib/auth.school-admin.functions";
import { toast } from "sonner";
import { ArrowLeft, Building2, Copy, Loader2, MapPin, Phone, Mail, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/super-admin/applications")({
  head: () => ({
    meta: [{ title: "School Applications — D4EXAM" }],
  }),
  component: Page,
});

type AppRow = {
  id: string;
  school_name: string;
  school_type: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  official_email: string | null;
  official_phone: string | null;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  tracking_code: string | null;
  status: string;
  created_at: string;
  review_notes: string | null;
  documents?: { logo_url?: string | null; logo_name?: string | null; notes?: string | null } | null;
};

type Creds = {
  schoolName: string;
  schoolCode: string;
  adminEmail: string;
  adminPassword: string;
  emailSent?: boolean;
  emailError?: string | null;
};

function SchoolLogo({
  url,
  name,
  size = "md",
}: {
  url?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dim =
    size === "xl"
      ? "h-20 w-20"
      : size === "lg"
        ? "h-14 w-14"
        : size === "sm"
          ? "h-9 w-9"
          : "h-12 w-12";
  if (url) {
    return (
      <img
        src={url}
        alt={`${name} logo`}
        className={cn(dim, "shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1 shadow-sm")}
      />
    );
  }
  return (
    <span
      className={cn(
        dim,
        "grid shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 shadow-sm",
      )}
      aria-hidden
    >
      <Building2 className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} />
    </span>
  );
}

function notesFromApp(app: AppRow): string | null {
  const docs = app.documents;
  if (!docs || typeof docs !== "object") return null;
  const n = (docs as { notes?: string | null }).notes;
  return typeof n === "string" && n.trim() ? n.trim() : null;
}

function logoFromApp(app: AppRow): string | null {
  const docs = app.documents;
  if (!docs || typeof docs !== "object") return null;
  const u = (docs as { logo_url?: string | null }).logo_url;
  return typeof u === "string" && u.trim() ? u.trim() : null;
}

function locationLine(app: AppRow): string {
  return [app.city, app.state, app.country].filter(Boolean).join(", ") || "—";
}

function Page() {
  const review = useServerFn(reviewSchoolApplication);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useRows<AppRow>({
    table: "school_applications",
    // Do not select non-existent "notes" column — notes live in documents JSON
    select:
      "id, school_name, school_type, country, state, city, address, official_email, official_phone, applicant_name, applicant_email, applicant_phone, tracking_code, status, created_at, review_notes, documents",
    order: { column: "created_at", ascending: false },
    limit: 100,
  });

  // Live updates: when a school submits, superadmin sees it immediately
  useEffect(() => {
    const channel = supabase
      .channel("super-admin-school-applications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "school_applications" },
        () => {
          void qc.invalidateQueries({ queryKey: ["rows", "school_applications"] });
          void refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, refetch]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [creds, setCreds] = useState<Creds | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const apps = data ?? [];
  const selected = useMemo(
    () => (selectedId ? apps.find((a) => a.id === selectedId) ?? null : null),
    [apps, selectedId],
  );

  async function decide(
    applicationId: string,
    decision: "approved" | "rejected" | "under_review" | "more_information_required",
  ) {
    if (decision === "approved") {
      const ok = window.confirm(
        "Are you sure you want to approve this school application?\n\nThis will create the school, generate login credentials, and notify the applicant.",
      );
      if (!ok) return;
    }
    if (decision === "rejected") {
      const ok = window.confirm("Reject this application? The school will not be created.");
      if (!ok) return;
    }

    setBusyId(applicationId);
    try {
      const result = await review({
        data: {
          applicationId,
          decision,
          notes: notes[applicationId]?.trim() || undefined,
        },
      });

      if (decision === "approved" && result && "schoolCode" in result && result.schoolCode) {
        const r = result as {
          schoolName?: string;
          schoolCode?: string;
          adminEmail?: string;
          adminPassword?: string;
          emailSent?: boolean;
          emailError?: string | null;
        };
        setCreds({
          schoolName: String(r.schoolName ?? "School"),
          schoolCode: String(r.schoolCode),
          adminEmail: String(r.adminEmail ?? ""),
          adminPassword: String(r.adminPassword ?? ""),
          emailSent: r.emailSent,
          emailError: r.emailError,
        });
        if (r.emailSent) {
          toast.success("School approved. Login details emailed to the applicant.");
        } else {
          toast.success(
            r.emailError
              ? `School approved. Email failed (${r.emailError}). Copy details below.`
              : "School approved. Copy the login details below (email not configured).",
          );
        }
      } else if (decision === "rejected") {
        toast.success("Application rejected.");
        setCreds(null);
      } else if (decision === "more_information_required") {
        toast.success("Marked as needing more information.");
      } else {
        toast.success("Application marked under review.");
      }

      await qc.invalidateQueries({ queryKey: ["rows", "school_applications"] });
      await refetch();
    } catch (e) {
      toast.error((e as Error).message || "Could not update application");
    } finally {
      setBusyId(null);
    }
  }

  function copyCreds() {
    if (!creds) return;
    const text = [
      `Congratulations! Your school is live on D4EXAM.`,
      `School: ${creds.schoolName}`,
      `School code: ${creds.schoolCode}`,
      `Admin email: ${creds.adminEmail}`,
      `Temporary password: ${creds.adminPassword}`,
      `Login: open /login, enter school code, email and password.`,
    ].join("\n");
    void navigator.clipboard.writeText(text).then(
      () => toast.success("Credentials copied"),
      () => toast.error("Could not copy"),
    );
  }

  if (selected) {
    const logo = logoFromApp(selected);
    const st = String(selected.status || "").toLowerCase();
    const isApproved = st === "approved";
    const isRejected = st === "rejected";
    const isPending =
      st === "pending" || st === "under_review" || st === "more_information_required" || !st;

    return (
      <>
        <PageHeader
          title={selected.school_name}
          description="Full application details submitted by the school"
          actions={<StatusBadge status={selected.status || "pending"} />}
        />

        <div className="mb-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="font-semibold"
            onClick={() => setSelectedId(null)}
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to applications
          </Button>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SchoolLogo url={logo} name={selected.school_name} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold text-slate-900">{selected.school_name}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {[selected.school_type, locationLine(selected)].filter(Boolean).join(" · ")}
            </p>
            {selected.tracking_code ? (
              <p className="mt-1 font-mono text-xs text-slate-400">Ref {selected.tracking_code}</p>
            ) : null}
          </div>
          <StatusBadge status={selected.status || "pending"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Institution">
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">{selected.school_name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Type</dt>
                <dd className="capitalize text-slate-800">{selected.school_type || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Location</dt>
                <dd className="text-slate-800">
                  <span className="inline-flex items-start gap-1">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                    {locationLine(selected)}
                  </span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Address</dt>
                <dd className="text-slate-800">{selected.address || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Official email</dt>
                <dd className="text-slate-800">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    {selected.official_email || "—"}
                  </span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Official phone</dt>
                <dd className="text-slate-800">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    {selected.official_phone || "—"}
                  </span>
                </dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Contact person">
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    {selected.applicant_name}
                  </span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Email</dt>
                <dd className="text-slate-800">{selected.applicant_email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Phone</dt>
                <dd className="text-slate-800">{selected.applicant_phone || "—"}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 font-semibold text-slate-500">Submitted</dt>
                <dd className="text-slate-800">
                  {selected.created_at ? new Date(selected.created_at).toLocaleString() : "—"}
                </dd>
              </div>
            </dl>
          </SectionCard>
        </div>

        {notesFromApp(selected) ? (
          <div className="mt-4">
            <SectionCard title="Applicant notes">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{notesFromApp(selected)}</p>
            </SectionCard>
          </div>
        ) : null}

        <div className="mt-4">
          <SectionCard title="School logo">
            <div className="flex items-center gap-4">
              <SchoolLogo url={logo} name={selected.school_name} size="xl" />
              <p className="text-sm text-slate-500">
                {logo
                  ? "Official logo uploaded with the application."
                  : "No logo was stored for this application."}
              </p>
            </div>
          </SectionCard>
        </div>

        {creds && (
          <div className="mt-4">
            <SectionCard title="Approved — login credentials" description="Share these with the school administrator.">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm">
                <p className="font-bold text-emerald-900">Congratulations — school space is ready</p>
                <ul className="mt-2 space-y-1 font-mono text-xs text-slate-800 sm:text-sm">
                  <li>
                    <span className="font-sans font-semibold text-slate-600">School:</span> {creds.schoolName}
                  </li>
                  <li>
                    <span className="font-sans font-semibold text-slate-600">School code:</span> {creds.schoolCode}
                  </li>
                  <li>
                    <span className="font-sans font-semibold text-slate-600">Admin email:</span> {creds.adminEmail}
                  </li>
                  <li>
                    <span className="font-sans font-semibold text-slate-600">Password:</span> {creds.adminPassword}
                  </li>
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 font-semibold" onClick={copyCreds}>
                    <Copy className="h-3.5 w-3.5" /> Copy details
                  </Button>
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        <div className="mt-6">
          {isApproved ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              Approved — this school is live. Manage it from Schools.
            </div>
          ) : isRejected ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              Rejected — no further review actions.
            </div>
          ) : (
            <SectionCard title="Review actions">
              <div className="space-y-2">
                <Textarea
                  placeholder="Review notes / feedback (optional)"
                  value={notes[selected.id] ?? selected.review_notes ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [selected.id]: e.target.value }))}
                  rows={2}
                  className="border-slate-200"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="font-semibold"
                    disabled={busyId === selected.id}
                    onClick={() => void decide(selected.id, "approved")}
                  >
                    {busyId === selected.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === selected.id}
                    onClick={() => void decide(selected.id, "under_review")}
                  >
                    Under review
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === selected.id}
                    onClick={() => void decide(selected.id, "more_information_required")}
                  >
                    Need more info
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === selected.id}
                    onClick={() => void decide(selected.id, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
                {isPending ? (
                  <p className="text-xs text-slate-500">Status: pending until you approve or reject.</p>
                ) : null}
              </div>
            </SectionCard>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="School Applications"
        description="Pending applications appear as cards. Click a school to open full details. Approve creates the school and login credentials."
      />

      {creds && (
        <SectionCard title="Approved — login credentials" description="Share these with the school administrator.">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm">
            <p className="font-bold text-emerald-900">Congratulations — school space is ready</p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-slate-800 sm:text-sm">
              <li>
                <span className="font-sans font-semibold text-slate-600">School:</span> {creds.schoolName}
              </li>
              <li>
                <span className="font-sans font-semibold text-slate-600">School code:</span> {creds.schoolCode}
              </li>
              <li>
                <span className="font-sans font-semibold text-slate-600">Admin email:</span> {creds.adminEmail}
              </li>
              <li>
                <span className="font-sans font-semibold text-slate-600">Password:</span> {creds.adminPassword}
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 font-semibold" onClick={copyCreds}>
                <Copy className="h-3.5 w-3.5" /> Copy details
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="mt-4 sm:mt-6">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading applications…</p>
        ) : apps.length === 0 ? (
          <EmptyState
            title="No applications"
            description="When schools apply from the public form, they stay here until you review them."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => {
              const logo = logoFromApp(app);
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setSelectedId(app.id)}
                  className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex w-full items-start gap-3">
                    <SchoolLogo url={logo} name={app.school_name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-bold text-slate-900">{app.school_name}</h2>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {[app.school_type, app.city || app.state || app.country].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <div className="mt-2">
                        <StatusBadge status={app.status || "pending"} />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    {app.created_at ? new Date(app.created_at).toLocaleString() : ""}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
