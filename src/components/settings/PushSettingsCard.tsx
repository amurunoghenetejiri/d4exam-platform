import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import { enablePushNotifications, getPushPermissionState } from "@/lib/push";
import { sendTestNotificationToSelf } from "@/lib/push-send.functions";

export function PushSettingsCard({ scope }: { scope?: string }) {
  const { data: session } = useSessionUser();
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState(() => getPushPermissionState());

  return (
    <SectionCard
      title="Push notifications"
      description="Browser alerts for exams, results and important updates"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Stay updated with exams, results and important D4EXAM updates on this device.
        </p>
        <p className="text-xs text-slate-500">
          Status: <span className="font-semibold">{pushStatus}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pushBusy || pushStatus === "unsupported"}
            onClick={() => {
              if (!session?.userId) {
                toast.error("Sign in required.");
                return;
              }
              setPushBusy(true);
              void enablePushNotifications(session.userId, session.role)
                .then((r) => {
                  setPushStatus(getPushPermissionState());
                  if (r.ok) toast.success("Notifications enabled on this device.");
                  else toast.error(r.error || "Could not enable notifications.");
                })
                .finally(() => setPushBusy(false));
            }}
          >
            {pushBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enable notifications
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={testBusy || !session?.userId}
            onClick={() => {
              if (!session?.userId) return;
              setTestBusy(true);
              void sendTestNotificationToSelf({
                data: { userId: session.userId, role: session.role || "" },
              })
                .then((r) => {
                  if (r && (r as { ok?: boolean }).ok) {
                    const meta = r as {
                      recipients?: number;
                      inAppInserted?: number;
                      push?: { sent?: number };
                    };
                    const n = meta.recipients ?? 0;
                    const inserted = meta.inAppInserted ?? 0;
                    toast.success(
                      `Test sent to ${n} user${n === 1 ? "" : "s"} (${inserted} in-app). Check the bell and Notifications.`,
                    );
                  } else {
                    toast.error((r as { error?: string })?.error || "Test failed");
                  }
                })
                .catch((e) => toast.error((e as Error).message || "Test failed"))
                .finally(() => setTestBusy(false));
            }}
          >
            {testBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send test notification
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Test creates an in-app notification for every user and sends a push to all registered
          devices. Open Notifications in settings (or the bell) to confirm each row received it.
        </p>
      </div>
    </SectionCard>
  );
}
