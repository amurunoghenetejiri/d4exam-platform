import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/dashboard/kit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/application-status")({
  head: () => ({
    meta: [
      { title: "Application Status — D4EXAM" },
      {
        name: "description",
        content: "Track the verification progress of your D4EXAM school application.",
      },
    ],
  }),
  component: Page,
});

const TRACK_KEY = "d4exam_school_application_track";

type AppRow = {
  id: string;
  school_name: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  applicant_email: string;
  tracking_code: string | null;
  issued_school_code: string | null;
  issued_admin_email: string | null;
  issued_admin_password: string | null;
};

function Page() {
  const [email, setEmail] = useState("");
  const [refId, setRefId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<AppRow[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRACK_KEY);
      if (!raw) return;
      const track = JSON.parse(raw) as { email?: string; trackingCode?: string };
      if (track.email) setEmail(track.email);
      if (track.trackingCode) setRefId(track.trackingCode);
    } catch {
      /* ignore */
    }
  }, []);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setRows(null);
    setLoading(true);
    try {
      const em = email.trim().toLowerCase();
      const code = refId.trim();
      if (!em) {
        setError("Enter the applicant email used when you applied.");
        return;
      }
      if (!code) {
        setError("Enter your tracking code (shown after you submitted the application).");
        return;
      }

      let q = supabase
        .from("school_applications")
        .select(
          "id, school_name, status, created_at, reviewed_at, review_notes, applicant_email, tracking_code, issued_school_code, issued_admin_email, issued_admin_password",
        )
        .ilike("applicant_email", em)
        .order("created_at", { ascending: false })
        .limit(5);

      if (code.includes("-") && code.length > 20) {
        q = q.eq("id", code);
      } else {
        q = q.ilike("tracking_code", code);
      }

      const { data, error: qError } = await q;
      if (qError) {
        setError(qError.message);
        return;
      }
      if (!data || data.length === 0) {
        setError("No application found for that email and tracking code.");
        return;
      }
      setRows(data as AppRow[]);
      try {
        localStorage.setItem(
          TRACK_KEY,
          JSON.stringify({
            id: data[0].id,
            trackingCode: data[0].tracking_code || code,
            email: em,
            schoolName: data[0].school_name,
          }),
        );
      } catch {
        /* ignore */
      }
    } catch {
      setError("Could not look up status. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">Application status</h1>
        <p className="mt-3 text-slate-600">
          Your application is saved in our database. Enter the applicant email and tracking code to
          see progress. If approved, your school login credentials appear below.
        </p>

        <form
          className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          onSubmit={check}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Applicant email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref">Tracking code</Label>
            <Input
              id="ref"
              required
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="e.g. D4AB12CD34"
              className="font-mono uppercase"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={loading} className="font-semibold">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
              </>
            ) : (
              "Check status"
            )}
          </Button>
        </form>

        {rows && (
          <ul className="mt-8 space-y-4">
            {rows.map((r) => {
              const approved = String(r.status).toLowerCase() === "approved";
              const hasCreds = approved && r.issued_school_code && r.issued_admin_password;
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{r.school_name}</h2>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-slate-600">
                    Tracking:{" "}
                    <span className="font-mono font-semibold">{r.tracking_code || "—"}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Submitted {new Date(r.created_at).toLocaleString()}
                    {r.reviewed_at ? ` · Reviewed ${new Date(r.reviewed_at).toLocaleString()}` : ""}
                  </p>
                  {r.review_notes && (
                    <p className="text-sm text-slate-600">Note: {r.review_notes}</p>
                  )}

                  {hasCreds && (
                    <Alert className="border-emerald-200 bg-emerald-50">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <AlertTitle className="text-emerald-900">Approved — your login details</AlertTitle>
                      <AlertDescription className="space-y-1 text-emerald-900">
                        <p>
                          School code:{" "}
                          <strong className="font-mono">{r.issued_school_code}</strong>
                        </p>
                        <p>
                          Admin email: <strong>{r.issued_admin_email || r.applicant_email}</strong>
                        </p>
                        <p>
                          Temporary password:{" "}
                          <strong className="font-mono">{r.issued_admin_password}</strong>
                        </p>
                        <p className="pt-1">
                          <Link to="/login" className="font-semibold text-primary underline">
                            Go to login
                          </Link>{" "}
                          and sign in with school code, email, and this password. Change the password
                          after first login.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {approved && !hasCreds && (
                    <p className="text-sm text-amber-700">
                      Status is approved. If credentials are missing, contact support or wait for the
                      super admin to re-issue credentials.
                    </p>
                  )}

                  {!approved && String(r.status).toLowerCase() === "pending" && (
                    <p className="text-sm text-slate-600">
                      Your application is saved and waiting for review. Check this page again later.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PublicLayout>
  );
}
