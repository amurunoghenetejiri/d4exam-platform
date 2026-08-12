import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  Clock,
  FileText,
  User,
  CalendarDays,
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
import * as mock from "@/data/mock";
import type { Exam } from "@/types";
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

type QueueItem = Exam & {
  createdBy?: string;
  notes?: string;
  questionsCount?: number;
  securitySummary?: string;
};

function Page() {
  const [queue, setQueue] = useState<QueueItem[]>(() =>
    mock.officerApprovalQueue.map((e) => ({
      ...e,
      questionsCount: e.questions,
      securitySummary: "Fullscreen · Tab monitor · Copy/paste blocked",
    })),
  );
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | "changes" | null>(null);
  const [comment, setComment] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");

  const stats = useMemo(() => {
    const pending = queue.filter((q) => q.status === "pending_approval").length;
    const changes = queue.filter((q) => q.status === "changes_requested").length;
    return { pending, changes, total: queue.length };
  }, [queue]);

  function openAction(item: QueueItem, a: "approve" | "reject" | "changes") {
    setSelected(item);
    setAction(a);
    setComment("");
    setScheduleStart("");
    setScheduleEnd("");
  }

  function closeDialog() {
    setSelected(null);
    setAction(null);
    setComment("");
  }

  function confirmAction() {
    if (!selected || !action) return;

    if (action === "reject" && !comment.trim()) {
      toast.error("Add a reason when rejecting an examination.");
      return;
    }
    if (action === "changes" && !comment.trim()) {
      toast.error("Describe the changes the teacher must make.");
      return;
    }
    if (action === "approve" && scheduleStart && scheduleEnd) {
      const start = new Date(scheduleStart);
      const end = new Date(scheduleEnd);
      if (end <= start) {
        toast.error("End time must be after start time.");
        return;
      }
    }

    setQueue((prev) =>
      prev
        .map((item) => {
          if (item.id !== selected.id) return item;
          if (action === "approve") {
            return {
              ...item,
              status: scheduleStart ? "scheduled" : "approved",
              date: scheduleStart
                ? new Date(scheduleStart).toLocaleString()
                : item.date,
              notes: comment.trim() || item.notes,
            };
          }
          if (action === "reject") {
            return { ...item, status: "rejected", notes: comment.trim() };
          }
          return { ...item, status: "changes_requested", notes: comment.trim() };
        })
        .filter((item) => {
          // Keep rejected/changes in list so officer can still see history in this session
          return true;
        }),
    );

    const labels = {
      approve: "Examination approved",
      reject: "Examination rejected",
      changes: "Changes requested from teacher",
    } as const;
    toast.success(labels[action]);
    closeDialog();
  }

  const activeQueue = queue.filter(
    (q) => q.status === "pending_approval" || q.status === "changes_requested",
  );
  const history = queue.filter(
    (q) => q.status === "approved" || q.status === "scheduled" || q.status === "rejected",
  );

  return (
    <>
      <PageHeader
        title="Examination Approvals"
        description="Review teacher-created examinations. Approve, reject, or request changes before scheduling."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Stat label="Pending approval" value={stats.pending} icon={Clock} tone="warning" />
        <Stat label="Changes requested" value={stats.changes} icon={MessageSquareWarning} tone="info" />
        <Stat label="In queue" value={stats.total} icon={FileText} tone="primary" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SectionCard title="Awaiting your decision">
          {activeQueue.length === 0 ? (
            <EmptyState
              title="No examinations awaiting approval"
              description="When teachers submit exams, they appear here for review."
            />
          ) : (
            <ul className="space-y-4">
              {activeQueue.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-extrabold text-slate-900">{item.title}</p>
                        <StatusBadge status={String(item.status).replaceAll("_", " ")} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.courseCode ?? item.code} · {item.course}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {item.createdBy ?? "Teacher"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {item.duration} min · {item.questionsCount ?? item.questions} questions
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Proposed: {item.date}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {item.securitySummary}
                        </span>
                      </div>
                      {item.notes && (
                        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Previous note: {item.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="font-semibold"
                      onClick={() => openAction(item, "approve")}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-semibold"
                      onClick={() => openAction(item, "changes")}
                    >
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
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Recent decisions" description="Approvals and rejections in this session">
          {history.length === 0 ? (
            <EmptyState title="No decisions yet" description="Processed examinations will show here." />
          ) : (
            <ul className="space-y-3">
              {history.map((item) => (
                <li
                  key={item.id + item.status}
                  className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">
                      {item.courseCode ?? item.code} · {item.createdBy ?? "Teacher"}
                    </p>
                    {item.notes && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{item.notes}</p>
                    )}
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
              {selected?.title} · {selected?.courseCode ?? selected?.code}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {action === "approve" && (
              <>
                <p className="text-sm text-slate-600">
                  Optionally set the delivery schedule now. Leave blank to approve without scheduling.
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
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="font-semibold"
              variant={action === "reject" ? "destructive" : "default"}
              onClick={confirmAction}
            >
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
