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
                data: {
                  userId: session.userId,
                  role: session.role || scope || "student",
                },
              })
                .then((r) => {
                  if (r && (r as { ok?: boolean }).ok) {
                    const push = (r as { push?: { reason?: string; sent?: number; skipped?: boolean } }).push;
                    if (push?.skipped && push.reason === "no devices") {
                      toast.error("Enable notifications on this device first, then try again.");
                    } else if (push?.skipped && push.reason) {
                      toast.message(`In-app sent. Push: ${push.reason}`);
                    } else {
                      toast.success("Test notification sent. Check your bell and device.");
                    }
                  } else {
                    toast.error((r as { error?: string })?.error || "Test failed");
                  }
                })
                .catch((e) => toast.error((e as Error).message || "Test failed"))
                .finally(() => setTestBusy(false));
            }}
          >
            {testBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send test to myself
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
