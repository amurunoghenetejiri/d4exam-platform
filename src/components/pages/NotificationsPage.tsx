import {
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
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  info: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
};

const SWIPE_THRESHOLD = 72;

function SwipeableNotif({
  n,
  onDismiss,
  onOpen,
}: {
  n: Notif;
  onDismiss: (id: string) => void;
  onOpen: (n: Notif) => void;
}) {
  const t = (n.type || "info").toLowerCase();
  const Icon = icons[t] ?? Info;
  const unreadItem = !n.read_at;
  const href = n.link || n.action_url || null;

  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);

  function onPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    dragging.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    setDx(0);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!dragging.current) return;
    const x = e.clientX - startX.current;
    const y = e.clientY - startY.current;
    // Prefer vertical scroll if gesture is mostly vertical
    if (Math.abs(y) > Math.abs(x) && Math.abs(y) > 10) {
      dragging.current = false;
      setDx(0);
      return;
    }
    setDx(x);
  }

  function endGesture() {
    if (!dragging.current && dx === 0) return;
    dragging.current = false;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      setLeaving(true);
      // Keep history in DB — mark read rather than delete
      onDismiss(n.id);
      return;
    }
    setDx(0);
  }

  function onPointerUp() {
    endGesture();
  }

  function onClick() {
    if (Math.abs(dx) > 8 || leaving) return;
    onOpen(n);
  }

  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-xl border border-slate-100 bg-white transition-shadow",
        unreadItem && "shadow-sm",
        leaving && "notif-swipe-out",
      )}
      style={
        leaving
          ? ({ "--swipe-x": dx >= 0 ? "110%" : "-110%" } as React.CSSProperties)
          : undefined
      }
    >
      {/* Dismiss hint track */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 flex w-16 items-center justify-center text-[10px] font-bold uppercase",
          dx > 0 ? "left-0 bg-emerald-50 text-emerald-700" : "right-0 bg-emerald-50 text-emerald-700",
        )}
        style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD) }}
      >
        Read
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(n);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragging.current = false;
          setDx(0);
        }}
        className={cn(
          "relative flex cursor-pointer gap-2.5 bg-white px-2.5 py-3 sm:gap-3 sm:px-3 sm:py-3.5",
          "touch-pan-y select-none",
        )}
        style={{
          transform: leaving ? undefined : `translateX(${dx}px)`,
          transition: dragging.current ? "none" : "transform 0.18s ease",
        }}
      >
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9",
            tones[t] ?? tones.info,
          )}
        >
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <p className={cn("text-sm leading-snug", unreadItem ? "font-semibold" : "font-medium")}>
              {n.title}
            </p>
            <span className="shrink-0 text-[10px] text-muted-foreground sm:text-xs">
              {new Date(n.created_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground sm:text-sm">{n.message}</p>
          {href ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary sm:text-xs">
              Open <ExternalLink className="h-3 w-3" />
            </p>
          ) : null}
          {unreadItem ? (
            <p className="mt-1 text-[10px] text-slate-400 sm:hidden">Swipe to mark as read</p>
          ) : null}
        </div>
        {unreadItem ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
      </div>
    </li>
  );
}

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
      await qc.invalidateQueries({ queryKey: ["count", "notifications"] });
      await qc.invalidateQueries({ queryKey: ["student-dashboard-notifs"] });
      await refetch();
    }
  }

  function openNotif(n: Notif) {
    if (!n.read_at) void markOne(n.id);
    const href = n.link || n.action_url || null;
    if (href) window.location.href = href;
  }

  function renderList(list: Notif[], swipeable: boolean) {
    return (
      <ul className="space-y-2">
        {list.map((n) =>
          swipeable && !n.read_at ? (
            <SwipeableNotif key={n.id} n={n} onDismiss={(id) => void markOne(id)} onOpen={openNotif} />
          ) : (
            <li key={n.id}>
              <button
                type="button"
                className="flex w-full gap-2.5 rounded-xl border border-slate-100 bg-white px-2.5 py-3 text-left sm:gap-3 sm:px-3 sm:py-3.5"
                onClick={() => openNotif(n)}
              >
                {(() => {
                  const t = (n.type || "info").toLowerCase();
                  const Icon = icons[t] ?? Info;
                  return (
                    <span
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-9 sm:w-9",
                        tones[t] ?? tones.info,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                    </span>
                  );
                })()}
                <div className="min-w-0 flex-1">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground sm:text-xs">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground sm:text-sm">
                    {n.message}
                  </p>
                </div>
              </button>
            </li>
          ),
        )}
      </ul>
    );
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`Realtime alerts for your ${scope} account. Swipe a notification to mark it read.`}
        actions={
          <Button
            variant="outline"
            size="sm"
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
          renderList(unreadItems, true)
        )}
      </SectionCard>

      <div className="mt-4 sm:mt-6">
        <SectionCard title="History" description={`${historyItems.length} older notifications`}>
          {historyItems.length === 0 ? (
            <EmptyState title="No history yet" description="Read notifications are kept here." />
          ) : (
            renderList(historyItems, false)
          )}
        </SectionCard>
      </div>
    </>
  );
}
