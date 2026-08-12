import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRows } from "@/lib/queries";
import { reviewSchoolApplication } from "@/lib/auth.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
};

function Page() {
  const review = useServerFn(reviewSchoolApplication);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useRows<AppRow>({
    table: "school_applications",
    select:
      "id, school_name, school_type, country, official_email, applicant_name, applicant_email, applicant_phone, status, created_at, review_notes",
    order: { column: "created_at", ascending: false },
    limit: 100,
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function decide(
    applicationId: string,
    decision: "approved" | "rejected" | "under_review" | "more_information_required",
  ) {
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
        toast.success(`Approved. School code: ${result.schoolCode}`);
      } else {
        toast.success(`Application marked ${decision.replaceAll("_", " ")}`);
      }
      await qc.invalidateQueries({ queryKey: ["rows"] });
      await refetch();
    } catch (e) {
      toast.error((e as Error).message || "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="School Applications"
        description="Review and approve institutions. Approval creates the school and invites the applicant."
      />

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading applications…</p>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No applications"
          description="When schools apply from the public form, they will appear here."
        />
      ) : (
        <div className="space-y-4">
          {(data ?? []).map((app) => (
            <SectionCard key={app.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">{app.school_name}</h2>
                    <StatusBadge status={app.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {[app.school_type, app.country].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Applicant: {app.applicant_name} · {app.applicant_email}
                    {app.applicant_phone ? ` · ${app.applicant_phone}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">Official: {app.official_email}</p>
                  <p className="text-xs text-slate-400">Submitted {new Date(app.created_at).toLocaleString()}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Textarea
                  placeholder="Review notes (optional)"
                  value={notes[app.id] ?? app.review_notes ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [app.id]: e.target.value }))}
                  rows={2}
                  className="border-slate-200"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="font-semibold"
                    disabled={busyId === app.id || app.status === "approved"}
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
                    disabled={busyId === app.id || app.status === "rejected"}
                    onClick={() => void decide(app.id, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </>
  );
}
