import { useState } from "react";
import { Bell, CheckCheck, Info, AlertTriangle, CircleCheck, CircleX } from "lucide-react";
import { notifications as seed } from "@/data/mock";
import { EmptyState, PageHeader, SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const icons = {
  info: Info,
  success: CircleCheck,
  warning: AlertTriangle,
  error: CircleX,
};

const tones = {
  info: "bg-info/12 text-info",
  success: "bg-primary/12 text-primary",
  warning: "bg-warning/12 text-warning",
  error: "bg-destructive/12 text-destructive",
};

export function NotificationsPage({ scope }: { scope: string }) {
  const [items, setItems] = useState(seed);

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`Alerts and updates for your ${scope} account.`}
        actions={
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setItems((prev) => prev.map((i) => ({ ...i, read: true })));
              toast.success("All notifications marked as read");
            }}
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            Mark all read
          </Button>
        }
      />

      <SectionCard title="Inbox" description={`${items.filter((i) => !i.read).length} unread`}>
        {items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description="You're all caught up. New alerts will appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const Icon = icons[n.type];
              return (
                <li key={n.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  <span
                    className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tones[n.type])}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <p className={cn("text-sm", n.read ? "font-medium" : "font-semibold")}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">{n.time}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                  </div>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
