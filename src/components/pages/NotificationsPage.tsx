import {
  Bell,
  CheckCheck,
  Info,
  AlertTriangle,
  CircleCheck,
  CircleX,
  ExternalLink,
} from "lucide-react";
import { EmptyState, PageHeader, SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSessionUser } from "@/lib/session";
import { useRows } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
};

const tones: Record<string, string> = {
  info: "bg-sky-50 text-sky-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
};

export function NotificationsPage({ scope }: { scope: string }) {
  const { data: user } = useSessionUser();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const notifFilter = user?.userId
    ? "recipient_user_id=eq." + user.userId
    : undefined;

  useRealtimeInvalidate(
    "notifs-" + (user?.userId ?? "anon"),
    [{ table: "notifications", filter: notifFilter }],
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

  function renderList(list: Notif[]) {
    return (
      <ul className="divide-y divide-border">
        {list.map((n) => {
          const t = (n.type || "info").toLowerCase();
          const Icon = icons[t] ?? Info;
          const unreadItem = !n.read_at;
          const href = n.link || n.action_url || null;
          return (
            <li
              key={n.id}
              className="flex cursor-pointer gap-3 py-4 first:pt-0 last:pb-0"
              onClick={() => {
                if (unreadItem) void markOne(n.id);
                if (href) window.location.href = href;
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
                {href ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    Open <ExternalLink className="h-3 w-3" />
                  </p>
                ) : null}
              </div>
              {unreadItem ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
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
          <p className="text-sm text-slate-500">Loading notifications…</p>
        ) : unreadItems.length === 0 ? (
          <EmptyState
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
