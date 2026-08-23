import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session";
import {
  enablePushNotifications,
  getPushPermissionState,
  refreshNativePushPermissionState,
  type PushPermissionState,
} from "@/lib/push";
import { sendTestNotificationToSelf } from "@/lib/push-send.functions";
import { isNativeShell } from "@/native/platform";

export function PushSettingsCard({ scope }: { scope?: string }) {
  const { data: session } = useSessionUser();
  const [pushBusy, setPushBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushPermissionState>(() => getPushPermissionState());
  const native = isNativeShell();

  useEffect(() => {
    if (!native) return;
    void refreshNativePushPermissionState().then(setPushStatus);
  }, [native]);

  return (
    <SectionCard
      title="Push notifications"
      description={
        native
          ? "Native Android alerts for exams, results and important updates"
          : "Browser alerts for exams, results and important updates"
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Stay updated with exams, results and important D4EXAM updates on this device.
        </p>
        <p className="text-xs text-slate-500">
          Status: <span className="font-semibold">{pushStatus}</span>
          {native ? " (Android app)" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={pushBusy || (!native && pushStatus === "unsupported")}
            onClick={() => {
              if (!session?.userId) {
                toast.error("Sign in required.");
                return;
              }
              setPushBusy(true);
              void enablePushNotifications(session.userId, session.role)
                .then(async (r) => {
                  if (native) setPushStatus(await refreshNativePushPermissionState());
                  else setPushStatus(getPushPermissionState());
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
                    toast.success("Test notification sent. Check your bell and device.");
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
          {native
            ? "On Android, notifications appear in the system shade as D4EXAM (not Chrome). Test sends in-app + push to your account only."
            : "Test sends an in-app notification and push to your account only. Open Notifications or the bell to confirm."}
        </p>
      </div>
    </SectionCard>
  );
}
