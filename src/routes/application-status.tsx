import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/dashboard/kit";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
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

type AppRow = {
  id: string;
  school_name: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  applicant_email: string;
};

function Page() {
  const [email, setEmail] = useState("");
  const [refId, setRefId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<AppRow[] | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setRows(null);
    setLoading(true);
    try {
      let q = supabase
        .from("school_applications")
        .select("id, school_name, status, created_at, reviewed_at, review_notes, applicant_email")
        .ilike("applicant_email", email.trim())
        .order("created_at", { ascending: false })
        .limit(10);

      if (refId.trim()) {
        q = q.eq("id", refId.trim());
      }

      const { data, error: qError } = await q;
      if (qError) {
        setError(qError.message);
        return;
      }
      if (!data || data.length === 0) {
        setError("No application found for that email" + (refId.trim() ? " and reference" : "") + ".");
        return;
      }
      setRows(data as AppRow[]);
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
          Enter the applicant email used when you applied. Optional: paste your reference ID.
        </p>

        <form className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={check}>
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
            <Label htmlFor="ref">Reference ID (optional)</Label>
            <Input
              id="ref"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="Application UUID from submission"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={loading} className="font-semibold">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Check status
          </Button>
        </form>

        {rows && (
          <div className="mt-6 space-y-4">
            {rows.map((r) => (
              <section key={r.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-slate-900">{r.school_name}</h2>
                    <p className="break-all text-xs text-slate-500">Ref: {r.id}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li>Submitted: {new Date(r.created_at).toLocaleString()}</li>
                  {r.reviewed_at && <li>Reviewed: {new Date(r.reviewed_at).toLocaleString()}</li>}
                  {r.review_notes && <li>Notes: {r.review_notes}</li>}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
