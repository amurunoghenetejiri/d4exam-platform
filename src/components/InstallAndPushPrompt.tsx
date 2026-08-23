import { useCallback, useEffect, useState } from "react";
import { Bell, Download, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enablePushNotifications, getPushPermissionState } from "@/lib/push";
import { useSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

/**
 * Bottom card: keep asking to Install app + Allow notifications until both are done
 * (or notifications unsupported). Does not spam the browser permission API — only on button press.
 */
export function InstallAndPushPrompt() {
  const { data: session } = useSessionUser();
  const [standalone, setStandalone] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [perm, setPerm] = useState(() => getPushPermissionState());
  const [minimized, setMinimized] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshPerm = useCallback(() => {
    setPerm(getPushPermissionState());
    setStandalone(isStandaloneDisplay());
  }, []);

  useEffect(() => {
    refreshPerm();
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", () => {
      setStandalone(true);
      setDeferred(null);
      toast.success("D4EXAM installed on this device.");
    });
    const onVis = () => refreshPerm();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshPerm]);

  const needInstall = !standalone;
  const needPush =
    Boolean(session?.userId) && perm !== "granted" && perm !== "unsupported";
  const show = (needInstall || needPush) && !minimized;

  if (!show) {
    if ((needInstall || needPush) && minimized) {
      return (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="fixed bottom-20 right-3 z-[80] flex h-12 w-12 items-center justify-center rounded-full bg-[#0b1b3a] text-white shadow-lg lg:bottom-6"
          aria-label="Open install and notifications tips"
        >
          <Bell className="h-5 w-5" />
        </button>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        "fixed inset-x-3 z-[80] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl",
        "bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 lg:left-auto lg:right-6 lg:w-[22rem]",
      )}
      role="dialog"
      aria-label="Install D4EXAM and enable notifications"
    >
      <div className="flex items-start gap-3">
        <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Get the full D4EXAM experience</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Install the app and allow notifications so you never miss exams, results, or important
            alerts.
          </p>
        </div>
        <button
          type="button"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Minimize"
          onClick={() => setMinimized(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-3 space-y-2 text-xs text-slate-600">
        {needInstall ? (
          <li className="flex gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900">
            <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              App not installed on this device. Install for a cleaner app icon (not Chrome) and
              better alerts.
            </span>
          </li>
        ) : null}
        {needPush ? (
          <li className="flex gap-2 rounded-lg bg-blue-50 px-2.5 py-2 text-blue-900">
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {perm === "denied"
                ? "Notifications are blocked. Open browser site settings and allow notifications for D4EXAM."
                : "Notifications are not enabled yet. Allow them to get exam and result alerts on this phone."}
            </span>
          </li>
        ) : null}
      </ul>

      <div className="mt-3 flex flex-col gap-2">
        {needInstall ? (
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  if (deferred) {
                    await deferred.prompt();
                    const choice = await deferred.userChoice;
                    if (choice.outcome === "accepted") {
                      setStandalone(true);
                      setDeferred(null);
                      toast.success("Installing D4EXAM…");
                    } else {
                      toast.message("Install when you are ready — this tip will stay available.");
                    }
                  } else {
                    const ua = navigator.userAgent || "";
                    const isIOS = /iPhone|iPad|iPod/i.test(ua);
                    if (isIOS) {
                      toast.message(
                        "On iPhone: tap Share → Add to Home Screen to install D4EXAM.",
                        { duration: 8000 },
                      );
                    } else {
                      toast.message(
                        "Use Chrome menu (⋮) → Install app or Add to Home screen.",
                        { duration: 8000 },
                      );
                    }
                  }
                } finally {
                  setBusy(false);
                  refreshPerm();
                }
              })();
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            Install D4EXAM app
          </Button>
        ) : null}

        {needPush ? (
          <Button
            type="button"
            variant={needInstall ? "outline" : "default"}
            className="w-full"
            disabled={busy || perm === "denied" || !session?.userId}
            onClick={() => {
              if (!session?.userId) {
                toast.error("Sign in first to enable notifications.");
                return;
              }
              setBusy(true);
              void enablePushNotifications(session.userId, session.role)
                .then((r) => {
                  refreshPerm();
                  if (r.ok) toast.success("Notifications enabled on this device.");
                  else toast.error(r.error || "Could not enable notifications.");
                })
                .finally(() => setBusy(false));
            }}
          >
            <Bell className="mr-2 h-4 w-4" />
            Allow notifications
          </Button>
        ) : null}
      </div>

      <p className="mt-2 text-center text-[10px] text-slate-400">
        This reminder stays until the app is installed and notifications are allowed.
      </p>
    </div>
  );
}
