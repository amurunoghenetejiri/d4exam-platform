import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  Clock,
  FileText,
  CalendarDays,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/officer/approvals")({
  head: () => ({
    meta: [
      { title: "Examination Approvals — D4EXAM" },
      {
        name: "description",
        content: "Review teacher-submitted examinations. Approve, reject or request changes.",
      },
    ],
  }),
  component: Page,
});

type ExamRow = {
  id: string;
  title: string;
  status: string;
  duration_minutes: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  description: string | null;
  course_id: string | null;
  created_by: string | null;
  created_at: string;
  courses: { code: string; name: string } | null;
};

function Page() {
  const { data: user } = useSessionUser();
  const schoolId = user?.schoolId ?? null;
  const qc = useQueryClient();

  const [selected, setSelected] = useState<ExamRow | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | "changes" | null>(null);
  const [comment, setComment] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [busy, setBusy] = useState(false);

  const listQ = useQuery({
    queryKey: ["officer-approvals", schoolId],
    enabled: Boolean(schoolId),
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!schoolId) return [] as ExamRow[];
      const { data, error } = await supabase
        .from("examinations")
        .select(
          "id, title, status, duration_minutes, scheduled_start, scheduled_end, description, course_id, created_by, created_at, courses(code, name)",
        )
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ExamRow[];
    },
  });

  const exams = listQ.data ?? [];

  const qCountsQ = useQuery({
    queryKey: ["officer-approval-qcounts", schoolId, exams.map((e) => e.course_id).join(",")],
    enabled: Boolean(schoolId && exams.length),
    queryFn: async () => {
      if (!schoolId) return {} as Record<string, number>;
      const courseIds = [...new Set(exams.map((e) => e.course_id).filter(Boolean))] as string[];
      if (!courseIds.length) return {};
      const { data } = await supabase
        .from("questions")
        .select("course_id")
        .eq("school_id", schoolId)
        .in("course_id", courseIds);
      const map: Record<string, number> = {};
      for (const q of data ?? []) {
        const c = (q as { course_id: string }).course_id;
        map[c] = (map[c] ?? 0) + 1;
      }
      return map;
    },
  });
  const qCounts = qCountsQ.data ?? {};

  const activeQueue = useMemo(
    () => exams.filter((q) => ["pending_approval", "changes_requested"].includes(q.status)),
    [exams],
  );

  const history = useMemo(
    () =>
      exams.filter((q) =>
        ["approved", "scheduled", "published", "rejected", "ongoing", "completed", "closed"].includes(
          q.status,
        ),
      ),
    [exams],
  );

  const stats = useMemo(
    () => ({
      pending: exams.filter((q) => q.status === "pending_approval").length,
      changes: exams.filter((q) => q.status === "changes_requested").length,
      total: activeQueue.length,
    }),
    [exams, activeQueue.length],
  );

  function openAction(item: ExamRow, a: "approve" | "reject" | "changes") {
    setSelected(item);
    setAction(a);
    setComment("");
    setScheduleStart(
      item.scheduled_start
        ? new Date(item.scheduled_start).toISOString().slice(0, 16)
        : "",
    );
    setScheduleEnd(
      item.scheduled_end ? new Date(item.scheduled_end).toISOString().slice(0, 16) : "",
    );
  }

  function closeDialog() {
    setSelected(null);
    setAction(null);
    setComment("");
  }

  async function confirmAction() {
    if (!selected || !action || !schoolId || !user) return;

    if (action === "reject" && !comment.trim()) {
      toast.error("Add a reason when rejecting an examination.");
      return;
    }
    if (action === "changes" && !comment.trim()) {
      toast.error("Describe the changes the teacher must make.");
      return;
    }
    if (action === "approve" && scheduleStart && scheduleEnd) {
      if (new Date(scheduleEnd) <= new Date(scheduleStart)) {
        toast.error("End time must be after start time.");
        return;
      }
    }

    setBusy(true);
    try {
      let nextStatus = "approved";
      if (action === "reject") nextStatus = "rejected";
      if (action === "changes") nextStatus = "changes_requested";
      if (action === "approve" && scheduleStart) nextStatus = "scheduled";

      const update: Record<string, unknown> = { status: nextStatus };
      if (action === "approve") {
        if (scheduleStart) update.scheduled_start = new Date(scheduleStart).toISOString();
        if (scheduleEnd) update.scheduled_end = new Date(scheduleEnd).toISOString();
      }
      if (comment.trim()) {
        const prefix =
          action === "approve"
            ? "[Officer note]"
            : action === "reject"
              ? "[Rejected]"
              : "[Changes requested]";
        const base = (selected.description || "").replace(
          /\n?\[(Officer note|Rejected|Changes requested)\][\s\S]*$/,
          "",
        );
        update.description = `${base}\n${prefix} ${comment.trim()}`.trim();
      }

      const { error } = await supabase
        .from("examinations")
        .update(update as never)
        .eq("id", selected.id)
        .eq("school_id", schoolId);
      if (error) throw error;

      await supabase.from("audit_logs").insert({
        school_id: schoolId,
        actor_user_id: user.userId,
        actor_role: "examination_officer",
        action: `exam_${action}`,
        entity_type: "examination",
        entity_id: selected.id,
        description: `${selected.title} → ${nextStatus}${comment.trim() ? `: ${comment.trim()}` : ""}`,
      } as never);

      if (selected.created_by) {
        const titles = {
          approve: "Examination approved",
          reject: "Examination rejected",
          changes: "Changes requested on your examination",
        } as const;
        await supabase.from("notifications").insert({
          recipient_user_id: selected.created_by,
          school_id: schoolId,
          title: titles[action],
          message: `${selected.title}: ${comment.trim() || nextStatus}`,
          type: action === "approve" ? "success" : action === "reject" ? "error" : "warning",
        } as never);
      }

      toast.success(
        action === "approve"
          ? "Examination approved"
          : action === "reject"
            ? "Examination rejected"
            : "Changes requested from teacher",
      );
      closeDialog();
      await qc.invalidateQueries({ queryKey: ["officer-approvals"] });
      await qc.invalidateQueries({ queryKey: ["count"] });
      await listQ.refetch();
    } catch (err) {
      toast.error((err as Error).message || "Could not update examination");
    } finally {
      setBusy(false);
    }
  }

  if (!schoolId) {
    return (
      <EmptyState
        title="No school linked"
        description="Your officer account is not linked to a school."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Examination Approvals"
        description={`${user?.fullName ?? "Officer"} · Review schedule, questions and security before approving`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Stat label="Pending approval" value={stats.pending} icon={Clock} tone="warning" />
        <Stat label="Changes requested" value={stats.changes} icon={MessageSquareWarning} tone="info" />
        <Stat label="In queue" value={stats.total} icon={FileText} tone="primary" />
      </div>

      {listQ.isError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {(listQ.error as Error).message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SectionCard
          title="Awaiting your decision"
          description={listQ.isFetching ? "Refreshing…" : "Teachers submit → you approve"}
        >
          {listQ.isLoading ? (
            <p className="text-sm text-slate-500">Loading examinations…</p>
          ) : activeQueue.length === 0 ? (
            <EmptyState
              title="No examinations awaiting approval"
              description="When a teacher submits an exam, it appears here."
            />
          ) : (
            <ul className="space-y-4">
              {activeQueue.map((item) => {
                const qn = item.course_id ? qCounts[item.course_id] ?? 0 : 0;
                return (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-extrabold text-slate-900">{item.title}</p>
                        <StatusBadge status={String(item.status).replaceAll("_", " ")} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.courses?.code ?? "—"} · {item.courses?.name ?? "Course"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {item.duration_minutes} min
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {item.scheduled_start
                            ? new Date(item.scheduled_start).toLocaleString()
                            : "Not scheduled"}
                          {item.scheduled_end
                            ? ` → ${new Date(item.scheduled_end).toLocaleString()}`
                            : ""}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          {qn} question(s) in course bank
                        </span>
                        <span className="text-slate-400">
                          Submitted {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                      {item.description && (
                        <div className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <p className="line-clamp-4 whitespace-pre-wrap">{item.description}</p>
                          {/security|tab|fullscreen|lockdown/i.test(item.description) && (
                            <p className="inline-flex items-center gap-1 font-semibold text-primary">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Security notes included in description
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" className="font-semibold" onClick={() => openAction(item, "approve")}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="font-semibold" onClick={() => openAction(item, "changes")}>
                        <MessageSquareWarning className="mr-1.5 h-4 w-4" />
                        Request changes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => openAction(item, "reject")}
                      >
                        <XCircle className="mr-1.5 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent decisions" description="Approved, scheduled, or rejected">
          {history.length === 0 ? (
            <EmptyState title="No decisions yet" description="Processed examinations will show here." />
          ) : (
            <ul className="space-y-3">
              {history.slice(0, 20).map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.courses?.code ?? "—"} · {item.courses?.name ?? ""}
                    </p>
                  </div>
                  <StatusBadge status={String(item.status).replaceAll("_", " ")} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <Dialog open={Boolean(action && selected)} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === "approve" && "Approve examination"}
              {action === "reject" && "Reject examination"}
              {action === "changes" && "Request changes"}
            </DialogTitle>
            <DialogDescription>
              {selected?.title} · {selected?.courses?.code}
              {selected?.course_id && qCounts[selected.course_id]
                ? ` · ${qCounts[selected.course_id]} questions`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {action === "approve" && (
              <>
                <p className="text-sm text-slate-600">
                  Optionally set the delivery schedule. Leave blank to approve without scheduling.
                </p>
                <div className="space-y-2">
                  <Label className="font-semibold">Start</Label>
                  <Input
                    type="datetime-local"
                    value={scheduleStart}
                    onChange={(e) => setScheduleStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold">End</Label>
                  <Input
                    type="datetime-local"
                    value={scheduleEnd}
                    onChange={(e) => setScheduleEnd(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label className="font-semibold">
                {action === "approve" ? "Note (optional)" : "Comment (required)"}
              </Label>
              <Textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  action === "approve"
                    ? "Optional note for the teacher…"
                    : action === "reject"
                      ? "Reason for rejection…"
                      : "What should the teacher change?"
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeDialog} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="font-semibold"
              variant={action === "reject" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void confirmAction()}
            >
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {action === "approve" && "Confirm approval"}
              {action === "reject" && "Confirm rejection"}
              {action === "changes" && "Send to teacher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  tone: "warning" | "info" | "primary";
}) {
  const tones = {
    warning: "bg-amber-50 text-amber-600",
    info: "bg-sky-50 text-sky-600",
    primary: "bg-blue-50 text-primary",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
        </div>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
