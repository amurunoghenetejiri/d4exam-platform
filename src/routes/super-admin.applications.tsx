import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRows } from "@/lib/queries";
import { reviewSchoolApplication } from "@/lib/auth.school-admin.functions";
import { toast } from "sonner";
import { Building2, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  official_email: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  status: string;
  created_at: string;
  review_notes: string | null;
  documents?: { logo_url?: string | null } | null;
};

type Creds = {
  schoolName: string;
  schoolCode: string;
  adminEmail: string;
  adminPassword: string;
  emailSent?: boolean;
  emailError?: string | null;
};

function SchoolLogo({ url, name, size = "md" }: { url?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-12 w-12";
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

function logoFromApp(app: AppRow): string | null {
  const docs = app.documents;
  if (!docs || typeof docs !== "object") return null;
  const u = (docs as { logo_url?: string | null }).logo_url;
  return typeof u === "string" && u.trim() ? u.trim() : null;
}

function Page() {
  const review = useServerFn(reviewSchoolApplication);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useRows<AppRow>({
    table: "school_applications",
    select:
      "id, school_name, school_type, country, official_email, applicant_name, applicant_email, applicant_phone, status, created_at, review_notes, documents",
    order: { column: "created_at", ascending: false },
    limit: 100,
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [creds, setCreds] = useState<Creds | null>(null);

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

  const apps = data ?? [];

  return (
    <>
      <PageHeader
        title="School Applications"
        description="Review applications. Approve creates the school, generates login credentials, and shows them on this page."
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
                <span className="font-sans font-semibold text-slate-600">School code:</span>{" "}
                {creds.schoolCode}
              </li>
              <li>
                <span className="font-sans font-semibold text-slate-600">Admin email:</span>{" "}
                {creds.adminEmail}
              </li>
              <li>
                <span className="font-sans font-semibold text-slate-600">Password:</span>{" "}
                {creds.adminPassword}
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 font-semibold" onClick={copyCreds}>
                <Copy className="h-3.5 w-3.5" /> Copy details
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-600">
              Tell them: go to Login → enter school code + email + password → they open the School Admin
              dashboard.
            </p>
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
          <div className="space-y-4">
            {apps.map((app) => {
              const logo = logoFromApp(app);
              const st = String(app.status || "").toLowerCase();
              const isApproved = st === "approved";
              const isRejected = st === "rejected";
              return (
                <SectionCard key={app.id} title="">
                  <div className="flex flex-wrap items-start gap-3">
                    <SchoolLogo url={logo} name={app.school_name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">{app.school_name}</h2>
                        <StatusBadge status={app.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[app.school_type, app.country].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                        <p>
                          <span className="font-semibold text-slate-500">Applicant:</span>{" "}
                          {app.applicant_name}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-500">Email:</span>{" "}
                          {app.applicant_email}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-500">Official email:</span>{" "}
                          {app.official_email}
                        </p>
                        {app.applicant_phone ? (
                          <p>
                            <span className="font-semibold text-slate-500">Phone:</span>{" "}
                            {app.applicant_phone}
                          </p>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Submitted {new Date(app.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {isApproved ? (
                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                      Approved — this school is live. Manage or remove it from Schools.
                    </div>
                  ) : isRejected ? (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                      Rejected — no further review actions.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <Textarea
                        placeholder="Review notes / feedback (optional)"
                        value={notes[app.id] ?? app.review_notes ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [app.id]: e.target.value }))}
                        rows={2}
                        className="border-slate-200"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="font-semibold"
                          disabled={busyId === app.id}
                          onClick={() => void decide(app.id, "approved")}
                        >
                          {busyId === app.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === app.id}
                          onClick={() => void decide(app.id, "under_review")}
                        >
                          Under review
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === app.id}
                          onClick={() => void decide(app.id, "more_information_required")}
                        >
                          Need more info
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === app.id}
                          onClick={() => void decide(app.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </SectionCard>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
