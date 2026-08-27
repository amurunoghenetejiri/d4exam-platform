import { useState, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, EmptyState } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSessionUser } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/realtime";
import { cn } from "@/lib/utils";

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

const typeStyles: Record<string, string> = {
  info: "bg-slate-100 text-slate-700",
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
  officer_warning: "bg-red-50 text-red-700",
};

function normalizeNotifScope(scope: string): string {
  const s = (scope || "").toLowerCase().trim();
  if (s.includes("super")) return "super-admin";
  if (s.includes("school") || s === "admin") return "admin";
  if (s.includes("officer") || s.includes("exam")) return "officer";
  if (s.includes("teacher")) return "teacher";
  if (s.includes("student")) return "student";
  return "student";
}

function actionLabelFor(n: Notif): string | null {
  try {
    const ty = (n.type || "").toLowerCase();
    const msg = (n.message || "").toLowerCase();
    const title = (n.title || "").toLowerCase();
    if (ty.includes("result") || msg.includes("view your result") || msg.includes("result has been released"))
      return "VIEW RESULT";
    if (
      title.includes("submitted for review") ||
      msg.includes("for examination review") ||
      msg.includes("open approvals")
    )
      return "OPEN APPROVALS";
    if (ty === "exam_available" || msg.includes("starts now") || msg.includes("tap below to start"))
      return "START EXAM";
    if (ty.includes("exam") && (msg.includes("approved") || msg.includes("scheduled"))) return "VIEW EXAM";
    if (ty.includes("school") || title.includes("school application") || title.includes("application approved"))
      return "VIEW DETAILS";
    if (ty.includes("reject") || ty.includes("revision")) return "REVIEW";
    if (n.link || n.action_url) return "VIEW DETAILS";
    return null;
  } catch {
    return n.link || n.action_url ? "VIEW DETAILS" : null;
  }
}

function resolveNotifHref(n: Notif, scopeRaw: string): string | null {
  const direct = (n.link || n.action_url || "").trim();
  if (direct.startsWith("/")) return direct;

  const scope = normalizeNotifScope(scopeRaw);
  const ty = (n.type || "info").toLowerCase();
  const home =
    scope === "super-admin"
      ? "/super-admin"
      : scope === "admin"
        ? "/admin"
        : scope === "officer"
          ? "/officer"
          : scope === "teacher"
            ? "/teacher"
            : "/student";

  const byScope: Record<string, Record<string, string>> = {
    student: {
      exam_available: "/student/examinations",
      exam_scheduled: "/student/examinations",
      exam_approved: "/student/examinations",
      result_published: "/student/results",
      result_pending_release: "/student/results",
      exam_submitted: "/student/results",
      exam_terminated: "/student/examinations",
      exam_paused: "/student/examinations",
      officer_warning: "/student/examinations",
      announcement: "/student/notifications",
      system_alert: "/student",
      warning: "/student/examinations",
    },
    teacher: {
      exam_submitted: "/teacher/examinations",
      exam_approved: "/teacher/examinations",
      exam_rejected: "/teacher/examinations",
      exam_revision_requested: "/teacher/examinations",
      exam_scheduled: "/teacher/examinations",
      announcement: "/teacher/notifications",
      system_alert: "/teacher",
    },
    officer: {
      exam_submitted: "/officer/approvals",
      exam_approved: "/officer/approvals",
      result_pending_release: "/officer/results",
      result_published: "/officer/results",
      officer_warning: "/officer/live-monitor",
      system_alert: "/officer/live-monitor",
      warning: "/officer/live-monitor",
      announcement: "/officer/notifications",
    },
    admin: {
      exam_scheduled: "/admin/examinations",
      exam_available: "/admin/examinations",
      result_published: "/admin/results",
      announcement: "/admin/notifications",
      system_alert: "/admin",
      school_approved: "/admin",
      school_suspended: "/admin",
      school_revoked: "/admin",
    },
    "super-admin": {
      system_alert: "/super-admin/applications",
      announcement: "/super-admin/applications",
      warning: "/super-admin/applications",
      info: "/super-admin/applications",
      school_application: "/super-admin/applications",
      school_approved: "/super-admin/schools",
      school_rejected: "/super-admin/applications",
      school_suspended: "/super-admin/schools",
      school_revoked: "/super-admin/schools",
    },
  };

  const map = byScope[scope] || byScope.student;
  return map[ty] || `${home}/notifications`;
}

async function fetchOwnNotifications(userId: string): Promise<Notif[]> {
  const full = "id, title, message, type, created_at, read_at, link, action_url";
  const minimal = "id, title, message, type, created_at, read_at";

  let data: unknown[] | null = null;
  let error: { message: string } | null = null;

  {
    const res = await supabase
      .from("notifications")
      .select(full)
      .eq("recipient_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(150);
    data = res.data as unknown[] | null;
    error = res.error;
  }

  if (error) {
    const retry = await supabase
      .from("notifications")
      .select(minimal)
      .eq("recipient_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(150);
    if (retry.error) {
      const legacy = await supabase
        .from("notifications")
        .select(minimal)
        .eq("user_id" as never, userId)
        .order("created_at", { ascending: false })
        .limit(150);
      if (legacy.error) throw new Error(retry.error.message || legacy.error.message);
      data = legacy.data as unknown[] | null;
    } else {
      data = retry.data as unknown[] | null;
    }
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      title: String(r.title ?? "Notification"),
      message: String(r.message ?? ""),
      type: String(r.type ?? "info"),
      created_at: String(r.created_at ?? new Date().toISOString()),
      read_at: (r.read_at as string | null) ?? null,
      link: (r.link as string | null) ?? null,
      action_url: (r.action_url as string | null) ?? null,
    } satisfies Notif;
  });
}

export function NotificationsPage({ scope }: { scope: string }) {
  const { data: user } = useSessionUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  useRealtimeInvalidate(
    `notifs-${user?.userId ?? "anon"}`,
    [
      {
        table: "notifications",
        filter: user?.userId ? `recipient_user_id=eq.${user.userId}` : undefined,
      },
    ],
    [
      ["own-notifications", user?.userId],
      ["rows", "notifications"],
      ["count", "notifications"],
      ["count", "notifications", "unread", user?.userId],
      ["student-dashboard-notifs"],
    ],
    Boolean(user?.userId),
    400,
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["own-notifications", user?.userId],
    enabled: Boolean(user?.userId),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user?.userId) return [] as Notif[];
      return fetchOwnNotifications(user.userId);
    },
  });

  const items = data ?? [];
  const unreadItems = items.filter((i) => !i.read_at);
  const historyItems = items.filter((i) => i.read_at);
  const unread = unreadItems.length;

  async function invalidateAll() {
    await qc.invalidateQueries({ queryKey: ["own-notifications", user?.userId] });
    await qc.invalidateQueries({ queryKey: ["rows", "notifications"] });
    await qc.invalidateQueries({ queryKey: ["count", "notifications"] });
    await qc.invalidateQueries({
      queryKey: ["count", "notifications", "unread", user?.userId],
    });
    await refetch();
  }

  async function markAllRead() {
    if (!user?.userId) return;
    setBusy(true);
    try {
      const { error: upErr } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_user_id", user.userId)
        .is("read_at", null);
      if (upErr) throw upErr;
      await invalidateAll();
      toast.success("All notifications marked as read");
    } catch (e) {
      toast.error((e as Error).message || "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllNotifications() {
    if (!user?.userId) return;
    if (!window.confirm("Delete all notifications permanently? This cannot be undone.")) return;
    setBusy(true);
    try {
      const { error: delErr } = await supabase
        .from("notifications")
        .delete()
        .eq("recipient_user_id", user.userId);
      if (delErr) throw delErr;
      await invalidateAll();
      toast.success("All notifications deleted");
    } catch (e) {
      toast.error((e as Error).message || "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    const { error: upErr } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_user_id", user?.userId ?? "");
    if (!upErr) await invalidateAll();
  }

  async function dismissOne(id: string, e?: MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    const { error: delErr } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("recipient_user_id", user?.userId ?? "");
    if (delErr) toast.error(delErr.message);
    else {
      await invalidateAll();
      toast.success("Notification dismissed");
    }
  }

  function renderList(list: Notif[], emptyTitle: string, emptyDesc: string) {
    if (!list.length) {
      return <EmptyState title={emptyTitle} description={emptyDesc} />;
    }
    return (
      <ul className="divide-y divide-slate-100">
        {list.map((n) => {
          const href = resolveNotifHref(n, scope);
          const unreadItem = !n.read_at;
          const actionLabel = actionLabelFor(n);
          return (
            <li
              key={n.id}
              className={cn(
                "flex gap-3 px-1 py-3 transition-colors hover:bg-slate-50/80",
                href || unreadItem ? "cursor-pointer" : "",
              )}
              onClick={() => {
                if (unreadItem) void markOne(n.id);
                if (href && href.startsWith("/")) {
                  try {
                    void navigate({ to: href as never });
                  } catch {
                    window.location.assign(href);
                  }
                } else if (href) {
                  window.location.href = href;
                }
              }}
            >
              <div
                className={cn(
                  "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                  unreadItem ? "bg-sky-500" : "bg-transparent",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                  <Badge variant="secondary" className={cn("text-[10px]", typeStyles[n.type] || typeStyles.info)}>
                    {(n.type || "info").replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{n.message}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {new Date(n.created_at).toLocaleString()}
                </p>
                {href && actionLabel && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2 h-7 text-[11px] font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (unreadItem) void markOne(n.id);
                      try {
                        void navigate({ to: href as never });
                      } catch {
                        window.location.assign(href);
                      }
                    }}
                  >
                    {actionLabel}
                  </Button>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600"
                onClick={(e) => void dismissOne(n.id, e)}
                aria-label="Dismiss"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
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
        description={`Alerts and updates for your ${scope} account.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy || unread === 0} onClick={() => void markAllRead()}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1 h-4 w-4" />}
              Mark all read
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || items.length === 0} onClick={() => void deleteAllNotifications()}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              Delete all
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
        </p>
      ) : isError ? (
        <SectionCard title="Could not load">
          <p className="text-sm text-red-600">
            {(error as Error)?.message || "Failed to load notifications."}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            If this continues, confirm your account is signed in and try Retry. You can still use the rest of the app.
          </p>
          <Button className="mt-3" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </SectionCard>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
            <Bell className="h-4 w-4" />
            <span>
              <strong className="text-slate-900">{unread}</strong> unread · {items.length} total
            </span>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Unread" description="New alerts for you">
              {renderList(unreadItems, "All caught up", "No unread notifications.")}
            </SectionCard>
            <SectionCard title="History" description="Previously opened">
              {renderList(historyItems, "No history yet", "Read notifications will appear here.")}
            </SectionCard>
          </div>
        </>
      )}
    </>
  );
}
