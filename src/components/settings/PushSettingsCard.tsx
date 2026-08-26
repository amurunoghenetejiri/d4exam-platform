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
import { sendNotification } from "@/lib/notifications";
import { isNativeShell } from "@/native/platform";
import { useQueryClient } from "@tanstack/react-query";

export function PushSettingsCard({ scope }: { scope?: string }) {
  const { data: session } = useSessionUser();
  const queryClient = useQueryClient();
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
          ? "Alerts for exams, results and updates (in-app + system when configured)"
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
              const role = session.role || "";
              const link =
                role === "super_admin"
                  ? "/super-admin/notifications"
                  : role === "school_admin"
                    ? "/admin/notifications"
                    : role === "examination_officer"
                      ? "/officer/notifications"
                      : role === "teacher"
                        ? "/teacher/notifications"
                        : role === "student"
                          ? "/student/notifications"
                          : "/";
              const title = "D4EXAM Test Notification";
              const message = "This is a test notification for your D4EXAM account.";

              void (async () => {
                try {
                  // 1) Server path (admin insert + optional FCM)
                  let serverOk = false;
                  try {
                    const r = await sendTestNotificationToSelf({
                      data: { userId: session.userId, role },
                    });
                    if (r && (r as { ok?: boolean }).ok) {
                      serverOk = true;
                      const push = (r as { push?: { sent?: number; skipped?: boolean; reason?: string } })
                        .push;
                      if (push && push.skipped && push.reason) {
                        console.info("[D4EXAM] push skipped:", push.reason);
                      }
                    }
                  } catch (e) {
                    console.warn("[D4EXAM] server test notify failed", e);
                  }

                  // 2) Always ensure an in-app row via client (works without service role)
                  const client = await sendNotification({
                    recipientUserId: session.userId,
                    title,
                    message,
                    type: "system_alert",
                    link,
                  });

                  // 3) Immediate visible feedback (works even without system tray FCM)
                  toast.success(title, { description: message, duration: 6000 });

                  void queryClient.invalidateQueries({ queryKey: ["count", "notifications"] });
                  void queryClient.invalidateQueries({
                    queryKey: ["count", "notifications", "unread", session.userId],
                  });

                  if (client.id || serverOk) {
                    toast.message("Saved to Notifications — open the bell or Notifications page.");
                  } else if (client.error) {
                    toast.error(client.error);
                  }
                } catch (e) {
                  toast.error((e as Error).message || "Test failed");
                } finally {
                  setTestBusy(false);
                }
              })();
            }}
          >
            {testBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send test notification
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          {native
            ? "You will see an in-app toast and a row under Notifications. System tray push needs Firebase (google-services) configured on the APK."
            : "Test creates an in-app notification and tries browser push when permission is granted."}
        </p>
      </div>
    </SectionCard>
  );
}
