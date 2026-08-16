import {
  Bell,
  CheckCheck,
  Info,
  AlertTriangle,
  CircleCheck,
  CircleX,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { EmptyState, PageHeader, SectionCard, PageLoading } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type MouseEvent } from "react";
import { useRealtimeInvalidate } from "@/lib/realtime";

type Notif = {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  read_at: string | null;
  link?: string | null;
  action_url?: string | null;
};

const icons: Record<string, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: AlertTriangle,
  error: CircleX,
  exam_submitted: Info,
  exam_approved: CircleCheck,
  exam_rejected: CircleX,
  exam_revision_requested: AlertTriangle,
  exam_scheduled: Info,
  exam_available: Info,
  result_published: CircleCheck,
  announcement: Info,
  system_alert: AlertTriangle,
};

const tones: Record<string, string> = {
  info: "bg-sky-50 text-sky-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
  exam_submitted: "bg-sky-50 text-sky-700",
  exam_approved: "bg-emerald-50 text-emerald-700",
  exam_rejected: "bg-red-50 text-red-700",
  exam_revision_requested: "bg-amber-50 text-amber-700",
  exam_scheduled: "bg-blue-50 text-blue-700",
  exam_available: "bg-blue-50 text-blue-700",
  result_published: "bg-emerald-50 text-emerald-700",
  announcement: "bg-violet-50 text-violet-700",
  system_alert: "bg-amber-50 text-amber-700",
};

export function NotificationsPage({ scope }: { scope: string }) {
  const { data: user } = useSessionUser();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  useRealtimeInvalidate(
    `notifs-${user?.userId ?? "anon"}`,
    [{ table: "notifications", filter: user?.userId ? `recipient_user_id=eq.${user.userId}` : undefined }],
    [["rows", "notifications"], ["count", "notifications"], ["student-dashboard-notifs"]],
    Boolean(user?.userId),
  );

  const { data, isLoading, refetch } = useRows<Notif>({
    table: "notifications",
    select: "id, title, message, type, created_at, read_at",
    filters: user?.userId ? [{ column: "recipient_user_id", value: user.userId }] : [],
    order: { column: "created_at", ascending: false },
    limit: 150,
    enabled: Boolean(user?.userId),
  });

  const items = data ?? [];
  const unreadItems = items.filter((i) => !i.read_at);
  const historyItems = items.filter((i) => i.read_at);
  const unread = unreadItems.length;

  async function markAllRead() {
    if (!user?.userId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_user_id", user.userId)
        .is("read_at", null);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["rows", "notifications"] });
      await qc.invalidateQueries({ queryKey: ["count", "notifications"] });
      await refetch();
      toast.success("All notifications marked as read");
    } catch (e) {
      toast.error((e as Error).message || "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      await qc.invalidateQueries({ queryKey: ["rows", "notifications"] });
      await refetch();
    }
  }

  async function dismissOne(id: string, e?: MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      toast.error(error.message || "Could not dismiss");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["rows", "notifications"] });
    await qc.invalidateQueries({ queryKey: ["count", "notifications"] });
    await refetch();
    toast.success("Notification dismissed");
  }

  function renderList(list: Notif[]) {
    return (
      <ul className="divide-y divide-border">
        {list.map((n) => {
          const t = (n.type || "info").toLowerCase();
          const Icon = icons[t] ?? Info;
          const unreadItem = !n.read_at;
          const hrefFromType: Record<string, string> = {
            exam_submitted: "/officer/approvals",
            exam_approved: "/teacher/examinations",
            exam_rejected: "/teacher/examinations",
            exam_revision_requested: "/teacher/examinations",
            exam_scheduled: "/teacher/examinations",
            exam_available: "/student/examinations",
            result_published: "/student/results",
            success: scope === "student" ? "/student/results" : `/${scope}`,
          };
          const href = n.link || n.action_url || hrefFromType[t] || null;
          return (
            <li
              key={n.id}
              className={cn(
                "group flex gap-3 py-4 first:pt-0 last:pb-0",
                href || unreadItem ? "cursor-pointer" : "",
              )}
              onClick={() => {
                if (unreadItem) void markOne(n.id);
                if (href && href.startsWith("/")) {
                  window.location.assign(href);
                } else if (href) {
                  window.location.href = href;
                }
              }}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                  tones[t] ?? tones.info,
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <p className={cn("text-sm", unreadItem ? "font-semibold" : "font-medium")}>
                    {n.title}
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                {href && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    Open related page <ExternalLink className="h-3 w-3" />
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {unreadItem && <span className="mt-2 h-2 w-2 rounded-full bg-primary" />}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 opacity-70 hover:text-red-600 group-hover:opacity-100"
                  aria-label="Dismiss notification"
                  onClick={(ev) => void dismissOne(n.id, ev)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`Realtime alerts for your ${scope} account.`}
        actions={
          <Button
            variant="outline"
            className="gap-2"
            disabled={busy || unread === 0}
            onClick={() => void markAllRead()}
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            Mark all read
          </Button>
        }
      />

      <SectionCard title="Unread" description={isLoading ? "Loading…" : `${unread} unread`}>
        {isLoading ? (
          <PageLoading label="Loading notifications…" />
        ) : unreadItems.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No unread notifications"
            description="You are all caught up. New alerts appear here in realtime."
          />
        ) : (
          renderList(unreadItems)
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="History" description={`${historyItems.length} older notifications`}>
          {historyItems.length === 0 ? (
            <EmptyState title="No history yet" description="Read notifications are kept here." />
          ) : (
            renderList(historyItems)
          )}
        </SectionCard>
      </div>
    </>
  );
}
