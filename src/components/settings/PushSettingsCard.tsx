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
import { isNativeShell } from "@/native/platform";

export function PushSettingsCard({ scope }: { scope?: string }) {
  const { data: session } = useSessionUser();
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushPermissionState>(() => getPushPermissionState());
  const native = isNativeShell();

  useEffect(() => {
    if (!native) {
      setPushStatus(getPushPermissionState());
      return;
    }
    let cancelled = false;
    void refreshNativePushPermissionState().then((s) => {
      if (!cancelled) setPushStatus(s);
    });
    const onVis = () => {
      void refreshNativePushPermissionState().then((s) => {
        if (!cancelled) setPushStatus(s);
      });
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [native]);

  const enabled = pushStatus === "granted";
  const unsupported = !native && pushStatus === "unsupported";

  return (
    <SectionCard title="Notifications" description="Exam and result alerts on this device">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {enabled
            ? "Notifications are enabled on this device."
            : unsupported
              ? "Notifications are not supported in this browser."
              : pushStatus === "denied"
                ? "Notifications are blocked. Open phone Settings → Apps → D4EXAM → Notifications and allow them, then return here."
                : "Enable notifications to get exam and result alerts."}
        </p>
        <p className="text-xs text-slate-500">
          Status:{" "}
          <span className={`font-semibold ${enabled ? "text-emerald-600" : "text-slate-700"}`}>
            {enabled ? "Enabled" : pushStatus === "denied" ? "Blocked" : unsupported ? "Unsupported" : "Off"}
          </span>
        </p>
        <Button
          type="button"
          disabled={pushBusy || unsupported || enabled}
          onClick={() => {
            if (!session?.userId) {
              toast.error("Sign in required.");
              return;
            }
            if (enabled) {
              toast.message("Notifications are already enabled.");
              return;
            }
            setPushBusy(true);
            void enablePushNotifications(session.userId, session.role, { requestPermission: true })
              .then(async (r) => {
                const next = native
                  ? await refreshNativePushPermissionState()
                  : getPushPermissionState();
                setPushStatus(next);
                if (r.ok && next === "granted") {
                  toast.success(
                    native
                      ? "Notifications enabled. Check your notification shade for a test message."
                      : "Notifications enabled.",
                  );
                } else if (r.ok && next !== "granted") {
                  toast.error("Permission not confirmed. Tap Enable again and choose Allow.");
                } else {
                  toast.error(r.error || "Could not enable notifications.");
                }
              })
              .catch((e) => {
                toast.error((e as Error)?.message || "Could not enable notifications.");
              })
              .finally(() => setPushBusy(false));
          }}
        >
          {pushBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {enabled ? "Notifications enabled" : pushBusy ? "Requesting permission…" : "Enable notifications"}
        </Button>
      </div>
    </SectionCard>
  );
}
